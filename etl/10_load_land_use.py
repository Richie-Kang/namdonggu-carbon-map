"""ETL 10 — Load 토지이용 zones into industrial_zones and stamp grid_100m.

Source: data/12_토지이용/U*.shp (multiple categories).
We treat 산업단지 / 도시지역 / 경제자유구역 etc. as polygon overlays. They
are written to `industrial_zones` (despite the table name they cover any
zone), and the dominant land-use is recorded on `grid_100m.land_use_category`
by area-share majority.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import geopandas as gpd
from shapely import wkb as shp_wkb
from utils import LOG, Snapshot, connect, data_path

os.environ.setdefault("SHAPE_ENCODING", "EUC-KR")

SOURCE_CRS = "EPSG:5186"  # land-use shapefiles ship in Central Belt 2010
TARGET_CRS = "EPSG:4326"
BBOX_BUFFER_DEG = 0.05

LU_DIR = data_path("12_토지이용")

CATEGORY_BY_PREFIX = {
    "UH101": "산업단지",
    "UH111": "산업기술단지",
    "UB701": "경제자유구역",
    "UQ111": "도시지역",
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


def main() -> int:
    snap = Snapshot(step="10_load_land_use")
    conn = connect()
    try:
        bbox = fetch_namdong_bbox(conn)
        if bbox is None:
            snap.warnings.append("no_buildings_bbox")
            snap.save()
            return 1
        shps = sorted(LU_DIR.glob("*.shp")) if LU_DIR.exists() else []
        if not shps:
            snap.warnings.append(f"no shp in {LU_DIR}")
            snap.save()
            return 1

        all_rows = []
        for shp in shps:
            prefix = shp.stem.split("_")[0]
            category = CATEGORY_BY_PREFIX.get(prefix, prefix)
            gdf = gpd.read_file(shp)
            if gdf.crs is None:
                gdf.set_crs(SOURCE_CRS, inplace=True)
            gdf = gdf.to_crs(TARGET_CRS)
            w, s, e, n = bbox
            gdf = gdf.cx[w:e, s:n].copy()
            snap.counts[f"shapes_{prefix}"] = int(len(gdf))
            if gdf.empty:
                continue
            name_col = next((c for c in gdf.columns if c.upper() in ("NAME", "ZONE_NM", "구역명")), None)
            for idx, row in gdf.iterrows():
                geom = row.geometry
                if geom is None or geom.is_empty:
                    continue
                if geom.geom_type == "Polygon":
                    from shapely.geometry import MultiPolygon
                    geom = MultiPolygon([geom])
                zid = f"{prefix}_{idx}"
                all_rows.append((
                    zid,
                    str(row.get(name_col) or "") if name_col else None,
                    category,
                    shp_wkb.dumps(geom, srid=4326, hex=True),
                ))

        with conn.cursor() as cur:
            cur.execute("truncate industrial_zones")
            cur.executemany(
                "insert into industrial_zones (zone_id, name, category, geom) "
                "values (%s, %s, %s, %s::geometry) on conflict (zone_id) do nothing",
                all_rows,
            )
            # Stamp grid_100m with dominant land-use category by area overlap.
            cur.execute("""
                with overlap as (
                    select g.grid_id, z.category,
                           st_area(st_intersection(g.geom, z.geom)) as a
                    from grid_100m g
                    join industrial_zones z
                      on g.geom && z.geom and st_intersects(g.geom, z.geom)
                ),
                ranked as (
                    select grid_id, category,
                           row_number() over (partition by grid_id order by sum(a) desc) as rk
                    from overlap
                    group by grid_id, category
                )
                update grid_100m g
                set land_use_category = ranked.category
                from ranked
                where ranked.rk = 1 and ranked.grid_id = g.grid_id;
            """)
        conn.commit()
        snap.counts["zones_inserted"] = len(all_rows)
        snap.save()
        snap.push_to_db(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
