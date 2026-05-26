#!/usr/bin/env bash
# ETL 07 — Export buildings + grid as PMTiles via tippecanoe.
set -euo pipefail

cd "$(dirname "$0")/.."

OUT_DIR="${PMTILES_OUT_DIR:-web/public/tiles}"
mkdir -p "$OUT_DIR" "etl/reports"

DB_URL="${SUPABASE_DB_URL:?SUPABASE_DB_URL not set}"

echo "[07] Export buildings.geojson"
ogr2ogr -f GeoJSON "etl/reports/buildings.geojson" \
  PG:"${DB_URL}" \
  -sql "select building_id, pnu, use_main, co2_kg_month, co2_quintile, population_pred, geom from buildings"

echo "[07] Export grid.geojson"
ogr2ogr -f GeoJSON "etl/reports/grid.geojson" \
  PG:"${DB_URL}" \
  -sql "select grid_id, co2_kg_month, co2_quintile, population_pred, building_count, geom from grid_100m"

echo "[07] tippecanoe buildings → pmtiles"
tippecanoe -o "$OUT_DIR/buildings.pmtiles" --force \
  --maximum-zoom=16 --minimum-zoom=10 \
  --drop-densest-as-needed \
  --no-feature-limit --no-tile-size-limit \
  --layer=buildings \
  "etl/reports/buildings.geojson"

echo "[07] tippecanoe grid → pmtiles"
tippecanoe -o "$OUT_DIR/grid.pmtiles" --force \
  --maximum-zoom=14 --minimum-zoom=9 \
  --layer=grid \
  "etl/reports/grid.geojson"

du -h "$OUT_DIR"/*.pmtiles
echo "[07] done"
