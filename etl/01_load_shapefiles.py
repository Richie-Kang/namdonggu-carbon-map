"""ETL 01 — Load parcels + buildings shapefiles into Supabase (PostGIS).

Steps:
- Read .shp (EPSG:5186) → reproject to EPSG:4326
- Validate geometries (ST_MakeValid fallback)
- Bulk insert via COPY
"""
from __future__ import annotations

import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely import wkb
from utils import LOG, Snapshot, connect, data_path, is_valid_pnu

PARCELS_DIR = data_path("1_연속지적도 (지번 폴리곤)")
BUILDINGS_DIR = data_path("2_건물 폴리곤 (GIS건물통합정보)")
TARGET_CRS = "EPSG:4326"
SIMPLIFY_TOL_M = 0.5  # ADR-0014


def load_and_reproject(folder: Path) -> gpd.GeoDataFrame:
    shps = sorted(folder.glob("*.shp"))
    if not shps:
        raise FileNotFoundError(f"no .shp in {folder}")
    gdf = gpd.read_file(shps[0])
    if gdf.crs is None:
        LOG.warning(f"crs_missing path={shps[0]} default_5186")
        gdf.set_crs("EPSG:5186", inplace=True)
    # Simplify in source SRID (meters) then reproject (ADR-0006, ADR-0014).
    gdf["geometry"] = gdf.geometry.buffer(0).simplify(SIMPLIFY_TOL_M, preserve_topology=True)
    gdf = gdf.to_crs(TARGET_CRS)
    return gdf


def load_parcels(conn) -> tuple[int, int]:
    gdf = load_and_reproject(PARCELS_DIR)
    LOG.info(f"parcels.read count={len(gdf)} cols={list(gdf.columns)[:10]}")
    inserted = 0
    skipped = 0
    cols = {c.lower(): c for c in gdf.columns}
    pnu_col = cols.get("pnu")
    jibun_col = cols.get("지번") or cols.get("jibun")
    addr_col = cols.get("주소") or cols.get("address")
    jimok_col = cols.get("지목") or cols.get("jimok")
    if pnu_col is None:
        raise RuntimeError("PNU column not found in parcels shapefile")

    with conn.cursor() as cur:
        cur.execute("truncate parcels cascade")
        with cur.copy(
            "copy parcels (pnu, jibun, address_jibun, address_road, jimok, geom) from stdin with (format binary)"
        ) as copy:
            from psycopg.types.json import Jsonb  # noqa: F401  (ensure ext loaded)
            for _, row in gdf.iterrows():
                pnu = str(row[pnu_col]) if row[pnu_col] is not None else ""
                if not is_valid_pnu(pnu):
                    skipped += 1
                    continue
                geom = row.geometry
                if geom is None or geom.is_empty:
                    skipped += 1
                    continue
                if not geom.is_valid:
                    geom = geom.buffer(0)
                wkb_bytes = wkb.dumps(geom, srid=4326)
                copy.write_row((
                    pnu,
                    str(row[jibun_col]) if jibun_col else None,
                    str(row[addr_col]) if addr_col else None,
                    None,
                    str(row[jimok_col]) if jimok_col else None,
                    wkb_bytes,
                ))
                inserted += 1
    conn.commit()
    return inserted, skipped


def load_buildings(conn) -> tuple[int, int]:
    gdf = load_and_reproject(BUILDINGS_DIR)
    LOG.info(f"buildings.read count={len(gdf)} cols={list(gdf.columns)[:12]}")
    inserted = 0
    skipped = 0
    cols = {c.lower(): c for c in gdf.columns}
    id_col = cols.get("건물고유번호") or cols.get("building_id") or cols.get("bld_id")
    pnu_col = cols.get("pnu")
    name_col = cols.get("건물명") or cols.get("name")
    use_col = cols.get("주용도") or cols.get("use_main")
    use_code_col = cols.get("주용도코드") or cols.get("use_code")
    fa_col = cols.get("층수")
    area_b_col = cols.get("건축면적")
    area_t_col = cols.get("연면적")
    h_col = cols.get("높이")
    appr_col = cols.get("사용승인일")

    if id_col is None:
        raise RuntimeError("building id column not found")

    with conn.cursor() as cur:
        cur.execute("truncate buildings cascade")
        with cur.copy(
            "copy buildings (building_id, pnu, name, use_main, use_main_code, "
            "floors_above, area_building, area_total, height_m, approved_at, geom) "
            "from stdin with (format binary)"
        ) as copy:
            for _, row in gdf.iterrows():
                bid = str(row[id_col]) if row[id_col] is not None else ""
                if not bid:
                    skipped += 1
                    continue
                geom = row.geometry
                if geom is None or geom.is_empty:
                    skipped += 1
                    continue
                if not geom.is_valid:
                    geom = geom.buffer(0)
                wkb_bytes = wkb.dumps(geom, srid=4326)
                def num(col: str | None, cast):
                    if not col or col not in gdf.columns:
                        return None
                    v = row[col]
                    if not pd.notna(v):
                        return None
                    try:
                        return cast(v)
                    except (TypeError, ValueError):
                        return None

                copy.write_row((
                    bid[:40],
                    str(row[pnu_col])[:19] if pnu_col and pd.notna(row[pnu_col]) and is_valid_pnu(str(row[pnu_col])) else None,
                    str(row[name_col]) if name_col and pd.notna(row[name_col]) else None,
                    str(row[use_col]) if use_col and pd.notna(row[use_col]) else None,
                    str(row[use_code_col])[:10] if use_code_col and pd.notna(row[use_code_col]) else None,
                    num(fa_col, int),
                    num(area_b_col, float),
                    num(area_t_col, float),
                    num(h_col, float),
                    row[appr_col] if appr_col and pd.notna(row[appr_col]) else None,
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

        b_ins, b_skip = load_buildings(conn)
        snap.counts["buildings_inserted"] = b_ins
        snap.counts["buildings_skipped"] = b_skip

        snap.save()
        snap.push_to_db(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
