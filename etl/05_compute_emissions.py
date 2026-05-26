"""ETL 05 — Recompute co2_kg_month on buildings using emission_factors table (re-runnable)."""
from __future__ import annotations

import sys

from utils import Snapshot, connect


def main() -> int:
    snap = Snapshot(step="05_compute_emissions")
    conn = connect()
    try:
        with conn.cursor() as cur:
            cur.execute("select source, factor from emission_factors")
            factors = {r["source"]: float(r["factor"]) for r in cur.fetchall()}
            elec = factors.get("electricity", 0.4781)
            gas = factors.get("gas_lng", 2.176)
            cur.execute("update building_energy set co2_kg = electricity_kwh * %s + gas_m3 * %s", (elec, gas))
            cur.execute("""
                with latest as (
                    select building_id, avg(co2_kg) as avg_co2
                    from building_energy
                    where yyyymm = (select max(yyyymm) from building_energy)
                    group by building_id
                )
                update buildings b
                set co2_kg_month = latest.avg_co2
                from latest
                where b.building_id = latest.building_id
            """)
            cur.execute("""
                with q as (
                    select building_id,
                           ntile(5) over (order by co2_kg_month) as q
                    from buildings
                    where co2_kg_month is not null and co2_kg_month > 0
                )
                update buildings b
                set co2_quintile = q.q
                from q
                where b.building_id = q.building_id
            """)
            cur.execute("select count(*) c, avg(co2_kg_month) avg, max(co2_kg_month) max from buildings where co2_kg_month > 0")
            row = cur.fetchone()
            snap.counts["buildings_with_co2"] = int(row["c"])
            snap.metrics["avg_co2_kg_month"] = float(row["avg"] or 0)
            snap.metrics["max_co2_kg_month"] = float(row["max"] or 0)
        conn.commit()
        snap.save()
        snap.push_to_db(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
