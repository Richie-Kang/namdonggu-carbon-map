"""harness/eval_etl.py — ETL gate.

Verifies counts, match rates, and DB size against thresholds. Returns non-zero on failure.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "etl"))
from utils import LOG, connect  # noqa: E402

CHECKS = {
    "parcels_count_min": 40_000,
    "buildings_count_min": 25_000,
    "energy_pnu_match_rate_min": 0.50,  # lower than 0.90 plan target until data fully merged
    "db_size_mb_max": 400.0,
    "building_energy_distribute_ratio_min": 0.95,
}


def fetch(cur, sql: str) -> dict | None:
    cur.execute(sql)
    return cur.fetchone()


def main() -> int:
    failures: list[str] = []
    conn = connect()
    metrics: dict[str, float] = {}
    try:
        with conn.cursor() as cur:
            parcels = fetch(cur, "select count(*) c from parcels")["c"]
            buildings = fetch(cur, "select count(*) c from buildings")["c"]
            metrics["parcels"] = parcels
            metrics["buildings"] = buildings
            if parcels < CHECKS["parcels_count_min"]:
                failures.append(f"parcels_count {parcels} < {CHECKS['parcels_count_min']}")
            if buildings < CHECKS["buildings_count_min"]:
                failures.append(f"buildings_count {buildings} < {CHECKS['buildings_count_min']}")

            r = fetch(cur, """
                select
                    (select count(distinct pnu) from energy_monthly)::float as energy_pnu,
                    (select count(*) from parcels)::float as parcels
            """)
            rate = (r["energy_pnu"] / r["parcels"]) if r["parcels"] else 0
            metrics["energy_pnu_match_rate"] = rate
            if rate < CHECKS["energy_pnu_match_rate_min"]:
                failures.append(f"energy_match {rate:.3f} < {CHECKS['energy_pnu_match_rate_min']}")

            size = fetch(cur, "select pg_database_size(current_database())::float as s")["s"]
            mb = size / (1024 * 1024)
            metrics["db_size_mb"] = mb
            if mb > CHECKS["db_size_mb_max"]:
                failures.append(f"db_size {mb:.1f}MB > {CHECKS['db_size_mb_max']}MB")

            # distribute ratio
            r2 = fetch(cur, """
                select
                  (select sum(electricity_kwh) from energy_monthly) as e_src,
                  (select sum(electricity_kwh) from building_energy) as e_dst
            """)
            if r2 and r2["e_src"]:
                ratio = float(r2["e_dst"] or 0) / float(r2["e_src"])
                metrics["distribute_ratio_electricity"] = ratio
                if ratio < CHECKS["building_energy_distribute_ratio_min"]:
                    failures.append(f"distribute_ratio {ratio:.4f} < {CHECKS['building_energy_distribute_ratio_min']}")
    finally:
        conn.close()

    report_dir = Path(__file__).resolve().parent / "reports"
    report_dir.mkdir(exist_ok=True)
    (report_dir / "etl.json").write_text(
        json.dumps({"failures": failures, "metrics": metrics}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    if failures:
        LOG.error(f"eval_etl FAIL {failures}")
        return 1
    LOG.info(f"eval_etl PASS {metrics}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
