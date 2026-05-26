"""ETL 08 — Load 행정경계 (시도/시군구/읍면동) into admin_boundary.

Source: data/10_행정경계/{01.시도,02.시군구,03.읍면동}/N3A_G*.zip (EPSG 5179).

We clip to a 20km bbox around 남동구 so the basemap stays light on tiles.
The shapefile covers all of South Korea otherwise.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely import wkb as shp_wkb
from utils import LOG, Snapshot, connect, data_path

os.environ.setdefault("SHAPE_ENCODING", "EUC-KR")

SOURCE_CRS = "EPSG:5179"
TARGET_CRS = "EPSG:4326"
BBOX_BUFFER_DEG = 0.15  # ~17 km

LEVELS = {
    "sido": data_path("extracted_aux", "N3A_G0010000", "N3A_G0010000.shp"),
    "sigungu": data_path("extracted_aux", "N3A_G0100000", "N3A_G0100000.shp"),
    "dong": data_path("extracted_aux", "N3A_G0110000", "N3A_G0110000.shp"),
}


def fetch_namdong_bbox(conn) -> tuple[float, float, float, float] | None:
    with conn.cursor() as cur:
        cur.execute(
            "select st_xmin(box), st_ymin(box), st_xmax(box), st_ymax(box) "
            "from (select st_extent(geom)::geometry as box from buildings) t"
        )
        r = cur.fetchone()
    if not r or r.get("st_xmin") is None:
        return None
    return (
        float(r["st_xmin"]) - BBOX_BUFFER_DEG,
        float(r["st_ymin"]) - BBOX_BUFFER_DEG,
        float(r["st_xmax"]) + BBOX_BUFFER_DEG,
        float(r["st_ymax"]) + BBOX_BUFFER_DEG,
    )


def load_level(conn, level: str, shp_path: Path, bbox: tuple[float, float, float, float]) -> int:
    if not shp_path.exists():
        LOG.warning(f"missing path={shp_path}")
        return 0
    gdf = gpd.read_file(shp_path)
    if gdf.crs is None:
        gdf.set_crs(SOURCE_CRS, inplace=True)
    gdf = gdf.to_crs(TARGET_CRS)
    w, s, e, n = bbox
    gdf = gdf.cx[w:e, s:n].copy()
    if gdf.empty:
        return 0

    # Detect schema (UFID / BJCD / NAME for these shapefiles).
    name_col = next((c for c in gdf.columns if c.upper() in ("NAME", "ADM_NM", "EMD_KOR_NM")), None)
    code_col = next((c for c in gdf.columns if c.upper() in ("BJCD", "ADM_CD", "EMD_CD")), None)
    ufid_col = next((c for c in gdf.columns if c.upper() in ("UFID", "OBJECTID", "ID")), None)

    inserted = 0
    rows = []
    for _, row in gdf.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        if geom.geom_type == "Polygon":
            from shapely.geometry import MultiPolygon
            geom = MultiPolygon([geom])
        ufid = str(row.get(ufid_col)) if ufid_col else f"{level}-{inserted}"
        rows.append((
            ufid[:50],
            str(row.get(code_col) or "")[:12],
            str(row.get(name_col) or ""),
            level,
            shp_wkb.dumps(geom, srid=4326, hex=True),
        ))
        inserted += 1

    with conn.cursor() as cur:
        cur.execute("delete from admin_boundary where level = %s", (level,))
        cur.executemany(
            "insert into admin_boundary (ufid, code, name, level, geom) "
            "values (%s, %s, %s, %s, %s::geometry) on conflict (ufid) do nothing",
            rows,
        )
    conn.commit()
    return inserted


def main() -> int:
    snap = Snapshot(step="08_load_boundaries")
    conn = connect()
    try:
        bbox = fetch_namdong_bbox(conn)
        if bbox is None:
            snap.warnings.append("no_buildings_bbox")
            snap.save()
            return 1
        for level, path in LEVELS.items():
            n = load_level(conn, level, path, bbox)
            snap.counts[level] = n
            LOG.info(f"boundary.level={level} inserted={n}")
        snap.save()
        snap.push_to_db(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
