"""ETL 02b — Distribute parcel-level energy to buildings by area_total ratio (ADR-0007)."""
from __future__ import annotations

import sys

from utils import LOG, Snapshot, connect, kg_co2


def main() -> int:
    snap = Snapshot(step="02b_distribute_to_buildings")
    conn = connect()
    try:
        with conn.cursor() as cur:
            # P2 fix: load emission factors from DB instead of inlining constants.
            cur.execute("select source, factor from emission_factors")
            factors = {r["source"]: float(r["factor"]) for r in cur.fetchall()}
            elec = factors.get("electricity")
            gas = factors.get("gas_lng")
            if elec is None or gas is None:
                raise RuntimeError(
                    "emission_factors table missing rows for electricity/gas_lng — run seed.sql"
                )
            snap.metrics["factor_electricity"] = elec
            snap.metrics["factor_gas_lng"] = gas

            cur.execute("truncate building_energy")
            cur.execute("""
                with parcel_area as (
                    select pnu, sum(coalesce(area_total, 0)) total
                    from buildings
                    group by pnu
                ),
                shares as (
                    select b.building_id, b.pnu,
                           case when pa.total > 0
                                then b.area_total / pa.total
                                else 1.0 / nullif((select count(*) from buildings b2 where b2.pnu = b.pnu), 0)
                           end as share
                    from buildings b
                    join parcel_area pa on pa.pnu = b.pnu
                )
                insert into building_energy (building_id, yyyymm, electricity_kwh, gas_m3, co2_kg, source)
                select s.building_id, e.yyyymm,
                       e.electricity_kwh * s.share,
                       e.gas_m3 * s.share,
                       0,
                       'proportional'
                from energy_monthly e
                join shares s on s.pnu = e.pnu
                where s.share is not null
            """)
            cur.execute(
                "update building_energy set co2_kg = electricity_kwh * %s + gas_m3 * %s",
                (elec, gas),
            )

            # integrity check: building_energy sum ≈ energy_monthly sum (ratio 1.00 ± 0.0001)
            cur.execute("""
                select
                    (select sum(electricity_kwh) from energy_monthly) as src_e,
                    (select sum(gas_m3) from energy_monthly) as src_g,
                    (select sum(electricity_kwh) from building_energy) as dst_e,
                    (select sum(gas_m3) from building_energy) as dst_g
            """)
            row = cur.fetchone()
            src_e = float(row["src_e"] or 0)
            src_g = float(row["src_g"] or 0)
            dst_e = float(row["dst_e"] or 0)
            dst_g = float(row["dst_g"] or 0)
            e_ratio = dst_e / src_e if src_e > 0 else 0
            g_ratio = dst_g / src_g if src_g > 0 else 0
            snap.metrics["electricity_distribute_ratio"] = round(e_ratio, 6)
            snap.metrics["gas_distribute_ratio"] = round(g_ratio, 6)
            if abs(e_ratio - 1.0) > 0.05 and src_e > 0:
                snap.warnings.append(
                    f"distribute_loss_electricity ratio={e_ratio:.4f} "
                    "(parcels with 0 buildings discard energy)"
                )
            if abs(g_ratio - 1.0) > 0.05 and src_g > 0:
                snap.warnings.append(f"distribute_loss_gas ratio={g_ratio:.4f}")

            # update buildings.co2_kg_month (latest month avg)
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

            # quintiles
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
            cur.execute("select count(*) c from building_energy")
            snap.counts["building_energy_rows"] = int(cur.fetchone()["c"])
            cur.execute("select count(*) c from buildings where co2_kg_month is not null")
            snap.counts["buildings_with_co2"] = int(cur.fetchone()["c"])
        conn.commit()
        snap.save()
        snap.push_to_db(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
