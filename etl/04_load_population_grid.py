"""ETL 04 — Load KOSIS 100m 다사 grid (shapefile + CSV) into grid_pop_100m.

Source data (already extracted from user-provided ZIPs):
  data/9_인구밀도/extracted/grid/grid_다사_100M.{shp,dbf,prj,cpg}
  data/9_인구밀도/extracted/census/2024년_인구_다사_100M.csv  (CP949, long format)

CSV schema (no header):
  year, GRID_CD, variable, value
  - to_in_001: 총인구
  - to_in_007: 0~14세
  - to_in_008: 15~64세
  - to_in_009: 65세 이상 (presence depends on release)

Spatial filter: clip to bounding box of `buildings` (with small buffer) so we
only load 남동구-relevant cells, not the whole country.
"""
from __future__ import annotations

import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely import wkb
from utils import LOG, Snapshot, connect, data_path

GRID_SHP = data_path("9_인구밀도", "extracted", "grid", "grid_다사_100M.shp")
CENSUS_CSV = data_path("9_인구밀도", "extracted", "census", "2024년_인구_다사_100M.csv")
SOURCE_CRS = "EPSG:5179"
TARGET_CRS = "EPSG:4326"
NAMDONG_BUFFER_DEG = 0.02  # ≈ 2km padding

VARIABLE_COLS = {
    "to_in_001": "population",
    "to_in_007": "population_0_14",
    "to_in_008": "population_15_64",
    "to_in_009": "population_65_up",
}


def fetch_namdong_bbox(conn) -> tuple[float, float, float, float] | None:
    with conn.cursor() as cur:
        cur.execute(
            "select st_xmin(box), st_ymin(box), st_xmax(box), st_ymax(box) "
            "from (select st_extent(geom)::geometry as box from buildings) t"
        )
        row = cur.fetchone()
    if not row or row.get("st_xmin") is None:
        return None
    return (
        float(row["st_xmin"]) - NAMDONG_BUFFER_DEG,
        float(row["st_ymin"]) - NAMDONG_BUFFER_DEG,
        float(row["st_xmax"]) + NAMDONG_BUFFER_DEG,
        float(row["st_ymax"]) + NAMDONG_BUFFER_DEG,
    )


def load_grid_polygons(bbox: tuple[float, float, float, float] | None) -> gpd.GeoDataFrame:
    LOG.info(f"grid.read path={GRID_SHP}")
    gdf = gpd.read_file(GRID_SHP)
    if gdf.crs is None:
        gdf.set_crs(SOURCE_CRS, inplace=True)
    gdf = gdf.to_crs(TARGET_CRS)
    if bbox is not None:
        w, s, e, n = bbox
        gdf = gdf.cx[w:e, s:n].copy()
    return gdf


def load_census_long() -> pd.DataFrame:
    df = pd.read_csv(
        CENSUS_CSV,
        encoding="cp949",
        header=None,
        names=["year", "grid_cd", "variable", "value"],
        dtype={"year": "Int64", "grid_cd": str, "variable": str, "value": "Int64"},
    )
    df = df[df["variable"].isin(VARIABLE_COLS.keys())]
    return df


def pivot_population(df: pd.DataFrame) -> pd.DataFrame:
    pivot = df.pivot_table(
        index="grid_cd", columns="variable", values="value", aggfunc="first"
    ).reset_index()
    pivot = pivot.rename(columns=VARIABLE_COLS)
    for col in VARIABLE_COLS.values():
        if col not in pivot.columns:
            pivot[col] = pd.NA
    return pivot[["grid_cd", "population", "population_0_14", "population_15_64", "population_65_up"]]


def main() -> int:
    snap = Snapshot(step="04_load_population_grid")

    if not GRID_SHP.exists() or not CENSUS_CSV.exists():
        snap.warnings.append(f"missing inputs grid={GRID_SHP.exists()} csv={CENSUS_CSV.exists()}")
        snap.save()
        LOG.error("Required input files missing — see ZIPs in data/9_인구밀도")
        return 1

    conn = connect()
    try:
        bbox = fetch_namdong_bbox(conn)
        if bbox is None:
            snap.warnings.append("no buildings extent — run ETL 01 first")
            snap.save()
            return 1
        LOG.info(f"grid.bbox {bbox}")

        gdf = load_grid_polygons(bbox)
        snap.counts["grid_cells_in_bbox"] = int(len(gdf))
        if gdf.empty:
            snap.warnings.append("no grid cells inside building bbox — check CRS")
            snap.save()
            return 1

        long_df = load_census_long()
        snap.counts["census_long_rows"] = int(len(long_df))

        pop = pivot_population(long_df)
        snap.counts["census_pivoted_rows"] = int(len(pop))

        merged = gdf.merge(pop, left_on="GRID_CD", right_on="grid_cd", how="inner")
        snap.counts["merged_rows"] = int(len(merged))
        if merged.empty:
            snap.warnings.append("merge_empty — GRID_CD vs grid_cd mismatch")

        inserted = 0
        from datetime import datetime, timezone
        from shapely import wkb as shp_wkb

        now = datetime.now(timezone.utc)
        rows_to_insert = []
        for _, row in merged.iterrows():
            geom = row.geometry
            if geom is None or geom.is_empty:
                continue
            if not geom.is_valid:
                geom = geom.buffer(0)
            wkb_hex = shp_wkb.dumps(geom, srid=4326, hex=True)

            def native(v):
                if v is None or pd.isna(v):
                    return None
                try:
                    return int(v)
                except (TypeError, ValueError):
                    return None

            pop_total = native(row.get("population")) or 0
            rows_to_insert.append((
                str(row["GRID_CD"])[:20],
                2024,
                wkb_hex,
                pop_total,
                native(row.get("population_0_14")),
                native(row.get("population_15_64")),
                native(row.get("population_65_up")),
                "kosis_2024_dasa",
                now,
            ))

        with conn.cursor() as cur:
            cur.execute("truncate grid_pop_100m")
            # reason: psycopg executemany batches well; text-coded WKB hex
            # avoids the binary protocol numeric edge case that bit us twice.
            cur.executemany(
                "insert into grid_pop_100m (grid_cd, year, geom, population, "
                "population_0_14, population_15_64, population_65_up, source, loaded_at) "
                "values (%s, %s, %s::geometry, %s, %s, %s, %s, %s, %s)",
                rows_to_insert,
            )
            inserted = len(rows_to_insert)
        conn.commit()
        snap.counts["grid_pop_100m_inserted"] = inserted

        with conn.cursor() as cur:
            cur.execute(
                "select count(*) c, sum(population) total, max(population) mx "
                "from grid_pop_100m"
            )
            stats = cur.fetchone()
        snap.metrics["pop_total_in_bbox"] = float(stats["total"] or 0)
        snap.metrics["pop_max_cell"] = float(stats["mx"] or 0)

        snap.save()
        snap.push_to_db(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
