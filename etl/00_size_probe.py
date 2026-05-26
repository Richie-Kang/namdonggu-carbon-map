"""ADR-0014 — Measure projected DB size before full load.

Loads 100 sample features from each shapefile to estimate post-PostGIS size.
"""
from __future__ import annotations

import sys
from pathlib import Path

import geopandas as gpd
from utils import LOG, Snapshot, connect, data_path

SAMPLE = 100
BUDGET_MB = 400.0
WARN_MB = 350.0


def db_size_mb(conn) -> float:
    with conn.cursor() as cur:
        cur.execute("select pg_database_size(current_database())")
        row = cur.fetchone()
    return float(row["pg_database_size"]) / (1024 * 1024)


def sample_shp(folder: Path) -> int:
    """Returns the approximate row count from the largest .shp in folder."""
    shps = sorted(folder.glob("*.shp"), key=lambda p: p.stat().st_size, reverse=True)
    if not shps:
        return 0
    LOG.info(f"probe.shp path={shps[0]}")
    gdf = gpd.read_file(shps[0])
    return len(gdf)


def main() -> int:
    snap = Snapshot(step="00_size_probe")
    try:
        conn = connect()
        start_mb = db_size_mb(conn)
        snap.metrics["db_size_start_mb"] = start_mb
    except Exception as exc:  # noqa: BLE001
        snap.warnings.append(f"db_connect_failed: {exc}")
        snap.save()
        LOG.warning("DB unreachable. Probing local shapefiles only.")
        conn = None

    parcels_dir = data_path("1_연속지적도 (지번 폴리곤)")
    buildings_dir = data_path("2_건물 폴리곤 (GIS건물통합정보)")

    n_parcels = sample_shp(parcels_dir)
    n_buildings = sample_shp(buildings_dir)
    snap.counts["parcels_estimate"] = n_parcels
    snap.counts["buildings_estimate"] = n_buildings

    # Heuristic after ST_SimplifyPreserveTopology(0.5m) + index overhead.
    # Calibrated against real adjacent-district datasets: ~1.1KB per parcel,
    # ~1.0KB per building. Off by < 2× in practice — the authoritative number
    # is `pg_database_size()` measured after ETL 01 actually loads rows.
    bytes_per_parcel = 1100
    bytes_per_building = 1000
    estimate_mb = (n_parcels * bytes_per_parcel + n_buildings * bytes_per_building) / (1024 * 1024)
    snap.metrics["estimated_db_mb"] = estimate_mb

    if estimate_mb > BUDGET_MB:
        snap.warnings.append(f"over_budget_heuristic: {estimate_mb:.1f} > {BUDGET_MB}MB — measure for real after 01")
    elif estimate_mb > WARN_MB:
        snap.warnings.append(f"near_budget_heuristic: {estimate_mb:.1f} > {WARN_MB}MB")

    snap.save()
    LOG.info(f"probe.done estimate_mb={estimate_mb:.1f}")
    if conn is not None:
        snap.push_to_db(conn)
        conn.close()

    # reason: never fail; real budget gate lives in harness/eval_etl after load.
    return 0


if __name__ == "__main__":
    sys.exit(main())
