"""ETL 06 — Build 100m grid covering 남동구 and aggregate building CO2."""
from __future__ import annotations

import sys

from utils import Snapshot, connect

GRID_M = 100  # cell size in meters
SRID_PROJ = 5186  # for area calcs


def main() -> int:
    snap = Snapshot(step="06_make_grid")
    conn = connect()
    try:
        with conn.cursor() as cur:
            cur.execute("truncate grid_100m")
            cur.execute(f"""
                with bnd as (
                    select st_setsrid(
                             st_extent(st_transform(geom, {SRID_PROJ}))::geometry,
                             {SRID_PROJ}
                           ) as ext
                    from buildings
                ),
                grid as (
                    select (st_squaregrid({GRID_M}, ext)).*
                    from bnd
                ),
                idgrid as (
                    select
                        format('%s_%s', i, j) as grid_id,
                        st_transform(geom, 4326) as geom
                    from grid
                )
                insert into grid_100m (grid_id, geom)
                select grid_id, geom from idgrid;
            """)
            cur.execute("""
                with bcell as (
                    select g.grid_id, b.building_id,
                           st_area(st_intersection(b.geom, g.geom)::geography) /
                           nullif(st_area(b.geom::geography), 0) as share,
                           b.co2_kg_month
                    from grid_100m g
                    join buildings b on b.geom && g.geom and st_intersects(b.geom, g.geom)
                    where b.co2_kg_month is not null
                ),
                agg as (
                    select grid_id,
                           sum(coalesce(co2_kg_month, 0) * coalesce(share, 0)) as co2,
                           count(distinct building_id) as bcount
                    from bcell
                    group by grid_id
                )
                update grid_100m g
                set co2_kg_month = a.co2,
                    building_count = a.bcount
                from agg a
                where g.grid_id = a.grid_id;
            """)
            # ADR-0004(revised): join KOSIS 100m population into our grid.
            cur.execute("""
                with pop as (
                    select g.grid_id,
                           sum(coalesce(gp.population, 0) *
                               (st_area(st_intersection(gp.geom, g.geom)) /
                                nullif(st_area(gp.geom), 0))) as pop
                    from grid_100m g
                    join grid_pop_100m gp on gp.geom && g.geom and st_intersects(gp.geom, g.geom)
                    group by g.grid_id
                )
                update grid_100m g
                set population_pred = pop.pop
                from pop
                where g.grid_id = pop.grid_id;
            """)
            # 다사메트릭 배분: grid_pop_100m 인구를 건물 연면적 비율로 buildings에 배분.
            cur.execute("""
                with grid_floor as (
                    select gp.grid_cd,
                           sum(coalesce(b.floor_area_ratio, 1)) as total_floor
                    from grid_pop_100m gp
                    join buildings b on st_intersects(b.geom, gp.geom)
                    group by gp.grid_cd
                ),
                bld_pop as (
                    select b.building_id,
                           sum(coalesce(gp.population, 0) *
                               coalesce(b.floor_area_ratio, 1) /
                               nullif(gf.total_floor, 0)) as pop
                    from buildings b
                    join grid_pop_100m gp on st_intersects(b.geom, gp.geom)
                    join grid_floor gf on gf.grid_cd = gp.grid_cd
                    group by b.building_id
                )
                update buildings b
                set population_pred = bp.pop
                from bld_pop bp
                where b.building_id = bp.building_id;
            """)

            cur.execute("""
                with q as (
                    select grid_id, ntile(5) over (order by co2_kg_month) as q
                    from grid_100m
                    where co2_kg_month > 0
                )
                update grid_100m g
                set co2_quintile = q.q
                from q
                where g.grid_id = q.grid_id;
            """)
            # P2 fix: co2_kg_month defaults to 0, so original `is null` clause
            # never matched. Treat zero or unmeasured cells consistently.
            cur.execute(
                "delete from grid_100m "
                "where building_count = 0 "
                "  and (co2_kg_month is null or co2_kg_month = 0)"
            )
            cur.execute("select count(*) c from grid_100m")
            snap.counts["grid_cells"] = int(cur.fetchone()["c"])
        conn.commit()
        snap.save()
        snap.push_to_db(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
