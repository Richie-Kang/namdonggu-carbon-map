#!/usr/bin/env bash
# ETL 07 — Export buildings + grid + boundary + roads + industrial_zones
# as PMTiles via tippecanoe.
set -euo pipefail

cd "$(dirname "$0")/.."

OUT_DIR="${PMTILES_OUT_DIR:-web/public/tiles}"
TMP_DIR="etl/reports"
mkdir -p "$OUT_DIR" "$TMP_DIR"

DB_URL="${SUPABASE_DB_URL:?SUPABASE_DB_URL not set}"

run() {
  local label="$1"; shift
  echo "[07] $label"
  "$@"
}

run "Export buildings.geojson" \
  ogr2ogr -f GeoJSON "$TMP_DIR/buildings.geojson" PG:"$DB_URL" \
    -sql "select building_id, pnu, use_main, address_jibun, address_road, co2_kg_month, co2_quintile, population_pred, floor_area_ratio, geom from buildings"

run "Export grid.geojson" \
  ogr2ogr -f GeoJSON "$TMP_DIR/grid.geojson" PG:"$DB_URL" \
    -sql "select grid_id, co2_kg_month, co2_quintile, population_pred, building_count, land_use_category, geom from grid_100m"

run "Export boundary.geojson" \
  ogr2ogr -f GeoJSON "$TMP_DIR/boundary.geojson" PG:"$DB_URL" \
    -sql "select ufid, code, name, level, geom from admin_boundary"

run "Export roads.geojson" \
  ogr2ogr -f GeoJSON "$TMP_DIR/roads.geojson" PG:"$DB_URL" \
    -sql "select road_id, road_class, geom from roads"

run "Export industrial_zones.geojson" \
  ogr2ogr -f GeoJSON "$TMP_DIR/industrial_zones.geojson" PG:"$DB_URL" \
    -sql "select zone_id, name, category, geom from industrial_zones"

run "tippecanoe buildings" \
  tippecanoe -o "$OUT_DIR/buildings.pmtiles" --force \
    --maximum-zoom=16 --minimum-zoom=10 \
    --drop-densest-as-needed --no-feature-limit --no-tile-size-limit \
    --layer=buildings "$TMP_DIR/buildings.geojson"

run "tippecanoe grid" \
  tippecanoe -o "$OUT_DIR/grid.pmtiles" --force \
    --maximum-zoom=14 --minimum-zoom=9 \
    --layer=grid "$TMP_DIR/grid.geojson"

run "tippecanoe boundary" \
  tippecanoe -o "$OUT_DIR/boundary.pmtiles" --force \
    --maximum-zoom=14 --minimum-zoom=8 \
    --no-tile-size-limit --layer=boundary "$TMP_DIR/boundary.geojson"

run "tippecanoe roads" \
  tippecanoe -o "$OUT_DIR/roads.pmtiles" --force \
    --maximum-zoom=16 --minimum-zoom=12 \
    --drop-densest-as-needed --layer=roads "$TMP_DIR/roads.geojson"

run "tippecanoe industrial_zones" \
  tippecanoe -o "$OUT_DIR/industrial_zones.pmtiles" --force \
    --maximum-zoom=15 --minimum-zoom=10 \
    --layer=zones "$TMP_DIR/industrial_zones.geojson"

du -h "$OUT_DIR"/*.pmtiles
echo "[07] done"
