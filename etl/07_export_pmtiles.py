"""ETL 07 (Python) — DB → GeoJSON → PMTiles (ogr2ogr 대체, Windows 호환).

tippecanoe 바이너리가 PATH 또는 프로젝트 루트에 있어야 합니다.
Windows 바이너리: https://github.com/felt/tippecanoe/releases
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from utils import LOG, Snapshot, connect

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(os.getenv("PMTILES_OUT_DIR", str(PROJECT_ROOT / "web/public/tiles")))
TMP_DIR = PROJECT_ROOT / "etl/reports"


def find_tippecanoe() -> str:
    for name in ("tippecanoe", "tippecanoe.exe"):
        if shutil.which(name):
            return name
        local = PROJECT_ROOT / name
        if local.exists():
            return str(local)
    LOG.error("tippecanoe 없음 — https://github.com/felt/tippecanoe/releases 에서 설치")
    sys.exit(1)


def export_geojson(cur, name: str, sql: str) -> Path:
    path = TMP_DIR / f"{name}.geojson"
    cur.execute(f"""
        select json_build_object(
            'type', 'FeatureCollection',
            'features', coalesce(json_agg(
                json_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(geom)::json,
                    'properties', to_jsonb(t) - 'geom'
                )
            ), '[]'::json)
        ) from ({sql}) t
    """)
    row = cur.fetchone()
    fc = row[0] if isinstance(row, tuple) else list(row.values())[0]
    path.write_text(json.dumps(fc), encoding="utf-8")
    count = len(fc.get("features", []))
    LOG.info(f"exported {name}.geojson features={count}")
    return path


def tippecanoe(exe: str, out: Path, src: Path, layer: str, opts: list[str]) -> None:
    cmd = [exe, "-o", str(out), "--force", "--layer", layer, *opts, str(src)]
    LOG.info(f"tippecanoe {layer}")
    subprocess.run(cmd, check=True)


def main() -> int:
    snap = Snapshot("07_export_pmtiles")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    exe = find_tippecanoe()

    conn = connect()
    with conn.cursor() as cur:
        buildings = export_geojson(cur, "buildings",
            "select building_id, pnu, use_main, address_jibun, address_road, "
            "co2_kg_month, co2_quintile, population_pred, floor_area_ratio, geom from buildings")
        grid = export_geojson(cur, "grid",
            "select grid_id, co2_kg_month, co2_quintile, population_pred, "
            "building_count, land_use_category, geom from grid_100m")
        boundary = export_geojson(cur, "boundary",
            "select ufid, code, name, level, geom from admin_boundary")
        roads = export_geojson(cur, "roads",
            "select road_id, road_class, geom from roads")
        zones = export_geojson(cur, "industrial_zones",
            "select zone_id, name, category, geom from industrial_zones")
    conn.close()

    tippecanoe(exe, OUT_DIR / "buildings.pmtiles", buildings, "buildings",
        ["--maximum-zoom=16", "--minimum-zoom=10",
         "--drop-densest-as-needed", "--no-feature-limit", "--no-tile-size-limit"])
    tippecanoe(exe, OUT_DIR / "grid.pmtiles", grid, "grid",
        ["--maximum-zoom=14", "--minimum-zoom=9"])
    tippecanoe(exe, OUT_DIR / "boundary.pmtiles", boundary, "boundary",
        ["--maximum-zoom=14", "--minimum-zoom=8", "--no-tile-size-limit"])
    tippecanoe(exe, OUT_DIR / "roads.pmtiles", roads, "roads",
        ["--maximum-zoom=16", "--minimum-zoom=12", "--drop-densest-as-needed"])
    tippecanoe(exe, OUT_DIR / "industrial_zones.pmtiles", zones, "zones",
        ["--maximum-zoom=15", "--minimum-zoom=10"])

    snap.counts["files"] = 5
    snap.save()
    LOG.info("[07] done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
