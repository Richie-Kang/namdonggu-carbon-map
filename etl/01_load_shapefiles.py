"""ETL 01 — Load parcels + buildings shapefiles into Supabase (PostGIS).

Both shapefiles cover 인천광역시 entirely with anonymized A0..A28 columns and
EUC-KR encoded .dbf text values.  We filter to 남동구 (시군구코드 28200) and
map A* columns to logical names per the GIS건물통합정보 / 연속지적도 schema
verified via ogrinfo against real rows.

Parcels (A0..A7):
  A1=PNU(19), A2=행정코드(10), A3=주소, A4=지번, A5=지번+지목, A6=일자, A7=시군구
Buildings (A0..A28):
  A1=건물고유번호, A2=PNU, A3=행정코드, A4=주소, A5=지번, A8=주용도코드,
  A9=주용도명, A12=건축면적, A13=사용승인일 str, A14=연면적, A18=높이,
  A21=대장PK, A22=일자, A23=시군구코드, A26=지상층수, A27=지하층수
"""
from __future__ import annotations

import os
import sys
from decimal import Decimal
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely import wkb
from utils import LOG, Snapshot, connect, data_path, is_valid_pnu

PARCELS_DIR = data_path("1_연속지적도 (지번 폴리곤)")
BUILDINGS_DIR = data_path("2_건물 폴리곤 (GIS건물통합정보)")
SOURCE_CRS = "EPSG:5186"
TARGET_CRS = "EPSG:4326"
SIMPLIFY_TOL_M = 0.5
SIGUNGU_NAMDONG = "28200"

# pyogrio honors the SHAPE_ENCODING env var for legacy .dbf without .cpg.
os.environ.setdefault("SHAPE_ENCODING", "EUC-KR")


def read_filtered(folder: Path, where: str) -> gpd.GeoDataFrame:
    shps = sorted(folder.glob("*.shp"))
    if not shps:
        raise FileNotFoundError(f"no .shp in {folder}")
    path = shps[0]
    LOG.info(f"shp.read path={path.name} where={where}")
    gdf = gpd.read_file(path, where=where, engine="pyogrio")
    if gdf.crs is None:
        gdf.set_crs(SOURCE_CRS, inplace=True)
    if str(gdf.crs).upper() != "EPSG:5186":
        # safety: 일부 dataset은 CRS 메타가 다를 수 있음
        gdf = gdf.to_crs(SOURCE_CRS)
    # Simplify in source SRID (meters), then reproject (ADR-0006, ADR-0014).
    gdf["geometry"] = gdf.geometry.buffer(0).simplify(SIMPLIFY_TOL_M, preserve_topology=True)
    gdf = gdf.to_crs(TARGET_CRS)
    return gdf


def split_jibun_jimok(value: str | None) -> tuple[str | None, str | None]:
    """A5 e.g. '216-4전' → ('216-4', '전').  지목은 늘 마지막 한 글자."""
    if not value:
        return (None, None)
    s = str(value).strip()
    if not s:
        return (None, None)
    if s[-1].isdigit():
        return (s, None)
    return (s[:-1], s[-1])


def load_parcels(conn) -> tuple[int, int]:
    gdf = read_filtered(PARCELS_DIR, where=f"A7='{SIGUNGU_NAMDONG}'")
    LOG.info(f"parcels.filtered count={len(gdf)} cols={list(gdf.columns)}")
    inserted = 0
    skipped = 0
    with conn.cursor() as cur:
        cur.execute("truncate parcels cascade")
        with cur.copy(
            "copy parcels (pnu, jibun, address_jibun, address_road, jimok, geom) "
            "from stdin with (format binary)"
        ) as copy:
            for _, row in gdf.iterrows():
                pnu = str(row.get("A1") or "")
                if not is_valid_pnu(pnu):
                    skipped += 1
                    continue
                geom = row.geometry
                if geom is None or geom.is_empty:
                    skipped += 1
                    continue
                if not geom.is_valid:
                    geom = geom.buffer(0)
                # parcels schema wants MultiPolygon; promote if needed.
                if geom.geom_type == "Polygon":
                    from shapely.geometry import MultiPolygon
                    geom = MultiPolygon([geom])
                wkb_bytes = wkb.dumps(geom, srid=4326)
                jibun_part, jimok_part = split_jibun_jimok(row.get("A5"))
                address_jibun = str(row.get("A3") or "") if pd.notna(row.get("A3")) else None
                if address_jibun and jibun_part:
                    address_jibun = f"{address_jibun} {jibun_part}".strip()
                copy.write_row((
                    pnu,
                    jibun_part,
                    address_jibun,
                    None,
                    jimok_part,
                    wkb_bytes,
                ))
                inserted += 1
    conn.commit()
    return inserted, skipped


def load_buildings(conn) -> tuple[int, int]:
    with conn.cursor() as cur:
        cur.execute("select pnu from parcels")
        valid_pnus: set[str] = {r["pnu"] for r in cur.fetchall()}
    LOG.info(f"buildings.valid_pnus_loaded count={len(valid_pnus)}")

    gdf = read_filtered(BUILDINGS_DIR, where=f"A23='{SIGUNGU_NAMDONG}'")
    LOG.info(f"buildings.filtered count={len(gdf)} cols={list(gdf.columns)}")
    # Dedupe by building_id (A1) — same number can appear as multiple polygons
    # (annex buildings). Keep the row with the largest 연면적 (A14) so the
    # dominant footprint wins.
    if "A1" in gdf.columns:
        gdf = gdf.assign(__a14=pd.to_numeric(gdf["A14"], errors="coerce").fillna(0))
        gdf = gdf.sort_values("__a14", ascending=False).drop_duplicates(subset="A1", keep="first")
        gdf = gdf.drop(columns="__a14")
        LOG.info(f"buildings.dedup_count={len(gdf)}")
    inserted = 0
    skipped = 0
    with conn.cursor() as cur:
        cur.execute("truncate buildings cascade")
        with cur.copy(
            "copy buildings (building_id, pnu, name, use_main, use_main_code, "
            "floors_above, floors_below, area_building, area_total, height_m, "
            "approved_at, geom) from stdin with (format binary)"
        ) as copy:
            for _, row in gdf.iterrows():
                bid = str(row.get("A1") or "").strip()
                pnu = str(row.get("A2") or "").strip()
                if not bid:
                    skipped += 1
                    continue
                geom = row.geometry
                if geom is None or geom.is_empty:
                    skipped += 1
                    continue
                if not geom.is_valid:
                    geom = geom.buffer(0)
                if geom.geom_type == "Polygon":
                    from shapely.geometry import MultiPolygon
                    geom = MultiPolygon([geom])
                wkb_bytes = wkb.dumps(geom, srid=4326)

                def num(col: str, cast):
                    v = row.get(col)
                    if v is None or pd.isna(v):
                        return None
                    try:
                        return cast(v)
                    except (TypeError, ValueError):
                        return None

                def dec(col: str):
                    # psycopg binary COPY requires Decimal for `numeric` columns.
                    v = row.get(col)
                    if v is None or pd.isna(v):
                        return None
                    try:
                        return Decimal(repr(float(v)))
                    except (TypeError, ValueError):
                        return None

                def text(col: str):
                    v = row.get(col)
                    if v is None or pd.isna(v):
                        return None
                    s = str(v).strip()
                    return s or None

                approved_str = text("A13")
                approved_date = None
                if approved_str:
                    try:
                        approved_date = pd.to_datetime(approved_str, errors="coerce").date()
                    except Exception:  # noqa: BLE001
                        approved_date = None

                clean_pnu = pnu[:19] if is_valid_pnu(pnu) and pnu in valid_pnus else None
                copy.write_row((
                    bid[:40],
                    clean_pnu,
                    None,  # 건물명은 통합정보에 없음 — 건축물대장 join 단계에서 채움
                    text("A9"),         # use_main
                    (text("A8") or "")[:10] or None,  # use_main_code
                    num("A26", int),    # floors_above
                    num("A27", int),    # floors_below
                    dec("A12"),         # area_building (numeric)
                    dec("A14"),         # area_total (numeric)
                    dec("A18"),         # height_m (numeric)
                    approved_date,
                    wkb_bytes,
                ))
                inserted += 1
    conn.commit()
    return inserted, skipped


def main() -> int:
    snap = Snapshot(step="01_load_shapefiles")
    conn = connect()
    try:
        p_ins, p_skip = load_parcels(conn)
        snap.counts["parcels_inserted"] = p_ins
        snap.counts["parcels_skipped"] = p_skip
        LOG.info(f"parcels.done inserted={p_ins} skipped={p_skip}")

        b_ins, b_skip = load_buildings(conn)
        snap.counts["buildings_inserted"] = b_ins
        snap.counts["buildings_skipped"] = b_skip
        LOG.info(f"buildings.done inserted={b_ins} skipped={b_skip}")

        with conn.cursor() as cur:
            cur.execute("select pg_database_size(current_database())::float as s")
            mb = float(cur.fetchone()["s"]) / (1024 * 1024)
        snap.metrics["db_size_mb_after_01"] = mb
        LOG.info(f"db_size_mb_after_01={mb:.1f}")

        snap.save()
        snap.push_to_db(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
