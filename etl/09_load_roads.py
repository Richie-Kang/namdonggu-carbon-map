"""ETL 09 — Load 도로 링크 (LineString) for basemap context.

Source: data/11_도시형태데이터/2..도로네트워크/02. 링크/*.shp (EPSG 5179).
Clip to buildings bbox + 2km.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import geopandas as gpd
from shapely import wkb as shp_wkb
from utils import LOG, Snapshot, connect, data_path

os.environ.setdefault("SHAPE_ENCODING", "EUC-KR")

SOURCE_CRS = "EPSG:5179"
TARGET_CRS = "EPSG:4326"
BBOX_BUFFER_DEG = 0.03  # ~3 km

LINKS_DIR = data_path("11_도시형태데이터", "2..도로네트워크", "02. 링크")


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


def main() -> int:
    snap = Snapshot(step="09_load_roads")
    conn = connect()
    try:
        bbox = fetch_namdong_bbox(conn)
        if bbox is None:
            snap.warnings.append("no_buildings_bbox")
            snap.save()
            return 1
        shps = sorted(LINKS_DIR.glob("*.shp")) if LINKS_DIR.exists() else []
        if not shps:
            snap.warnings.append(f"no shp in {LINKS_DIR}")
            snap.save()
            return 1
        path: Path = shps[0]
        LOG.info(f"roads.read {path}")
        gdf = gpd.read_file(path)
        if gdf.crs is None:
            gdf.set_crs(SOURCE_CRS, inplace=True)
        gdf = gdf.to_crs(TARGET_CRS)
        w, s, e, n = bbox
        gdf = gdf.cx[w:e, s:n].copy()
        snap.counts["roads_in_bbox"] = int(len(gdf))

        cls_col = next(
            (c for c in gdf.columns if c.upper() in ("ROAD_RANK", "ROAD_TYPE", "ROADTYPE", "CLASS")),
            None,
        )
        rows = []
        for _, row in gdf.iterrows():
            geom = row.geometry
            if geom is None or geom.is_empty:
                continue
            if geom.geom_type != "LineString":
                # MultiLineString → split into singles for the LineString column
                if geom.geom_type == "MultiLineString":
                    for sub in geom.geoms:
                        rows.append((
                            str(row.get(cls_col) or "") if cls_col else None,
                            shp_wkb.dumps(sub, srid=4326, hex=True),
                        ))
                    continue
                continue
            rows.append((
                str(row.get(cls_col) or "") if cls_col else None,
                shp_wkb.dumps(geom, srid=4326, hex=True),
            ))

        with conn.cursor() as cur:
            cur.execute("truncate roads")
            cur.executemany(
                "insert into roads (road_class, geom) values (%s, %s::geometry)",
                rows,
            )
        conn.commit()
        snap.counts["roads_inserted"] = len(rows)
        snap.save()
        snap.push_to_db(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
