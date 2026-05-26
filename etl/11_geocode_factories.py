"""ETL 11 — Kakao Local API geocoding for factories + improved business match.

For each factory row without a geom we hit Kakao address-search to fill
geom, then ST_DWithin-match a building. We also expand the business→building
match radius from strict ST_Contains to 15 m DWithin (centroid-based) to
recover shops whose lat/lon falls just outside the building polygon.

API: https://dapi.kakao.com/v2/local/search/address.json?query=<addr>
Header: Authorization: KakaoAK <REST_KEY>
Free tier: 100k requests / day.
"""
from __future__ import annotations

import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import requests
from tenacity import retry, stop_after_attempt, wait_exponential
from utils import LOG, Snapshot, connect, normalize_address, require_env

# Factory addresses often carry trailing company names / suite info.
# Strip everything after the 본번-부번 token so Kakao can resolve them.
JIBUN_TOKEN_RE = re.compile(r"^(.*?\s+\d+(?:-\d+)?)")


def clean_factory_addr(raw: str) -> str:
    if not raw:
        return ""
    s = normalize_address(raw)
    m = JIBUN_TOKEN_RE.match(s)
    return m.group(1).strip() if m else s

KAKAO_URL = "https://dapi.kakao.com/v2/local/search/address.json"
CACHE_PATH = Path(__file__).resolve().parent / "cache" / "geocoded_factories.json"
CONCURRENCY = 8
BUILDING_MATCH_RADIUS_M = 25
BUSINESS_MATCH_RADIUS_M = 15


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
def kakao_geocode(addr: str, headers: dict[str, str]) -> tuple[float, float] | None:
    if not addr:
        return None
    r = requests.get(KAKAO_URL, params={"query": addr}, headers=headers, timeout=8)
    if r.status_code == 429:
        raise RuntimeError("kakao_rate_limited")
    if r.status_code != 200:
        return None
    payload: dict[str, Any] = r.json()
    docs = payload.get("documents") or []
    if not docs:
        return None
    d = docs[0]
    try:
        return (float(d["x"]), float(d["y"]))
    except (TypeError, ValueError, KeyError):
        return None


def load_cache() -> dict[str, list[float] | None]:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict[str, list[float] | None]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def geocode_factories(conn, snap: Snapshot) -> None:
    require_env("KAKAO_REST_API_KEY")
    headers = {"Authorization": f"KakaoAK {os.environ['KAKAO_REST_API_KEY']}"}

    with conn.cursor() as cur:
        cur.execute(
            "select factory_id, address_jibun from factories "
            "where address_jibun is not null and geom is null"
        )
        targets = [(r["factory_id"], r["address_jibun"]) for r in cur.fetchall()]
    LOG.info(f"factories.to_geocode count={len(targets)}")

    cache = load_cache()
    new_hits = 0
    misses = 0

    def task(item: tuple[str, str]) -> tuple[str, tuple[float, float] | None]:
        fid, addr = item
        cleaned = clean_factory_addr(addr)
        if not cleaned:
            return fid, None
        if cleaned in cache:
            cached = cache[cleaned]
            return fid, (tuple(cached) if cached else None)  # type: ignore[return-value]
        coords = kakao_geocode(cleaned, headers)
        cache[cleaned] = list(coords) if coords else None
        return fid, coords

    results: list[tuple[str, tuple[float, float] | None]] = []
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        futures = [ex.submit(task, t) for t in targets]
        for i, fut in enumerate(as_completed(futures), 1):
            try:
                results.append(fut.result())
            except Exception as exc:  # noqa: BLE001
                LOG.warning(f"geocode_error {exc}")
            if i % 500 == 0:
                LOG.info(f"geocode.progress {i}/{len(targets)}")
                save_cache(cache)

    save_cache(cache)

    updates = [(lon, lat, fid) for fid, coords in results if coords for lon, lat in [coords]]
    with conn.cursor() as cur:
        cur.executemany(
            "update factories set geom = st_setsrid(st_makepoint(%s, %s), 4326) where factory_id = %s",
            updates,
        )
    conn.commit()
    new_hits = len(updates)
    misses = len(results) - new_hits

    snap.counts["factories_geocode_hit"] = new_hits
    snap.counts["factories_geocode_miss"] = misses
    LOG.info(f"geocode.done hits={new_hits} misses={misses}")


def _rematch_chunked(conn, kind: str, id_col: str, table: str, radius_m: int) -> int:
    """Per-row nearest-neighbor match — avoids the pooler statement_timeout."""
    with conn.cursor() as cur:
        cur.execute(
            f"select {id_col} as id from {table} where building_id is null and geom is not null"
        )
        ids = [r["id"] for r in cur.fetchall()]
    LOG.info(f"{kind}.rematch candidates={len(ids)} radius={radius_m}m")

    matched = 0
    batch = []
    BATCH = 200
    with conn.cursor() as cur:
        for i, item_id in enumerate(ids, 1):
            cur.execute(
                f"""
                select bd.building_id, bd.pnu
                from {table} t
                join lateral (
                    select b.building_id, b.pnu
                    from buildings b
                    where b.geom is not null
                      and st_dwithin(b.centroid::geography, t.geom::geography, %s)
                    order by b.centroid <-> t.geom
                    limit 1
                ) bd on true
                where t.{id_col} = %s
                """,
                (radius_m, item_id),
            )
            r = cur.fetchone()
            if r:
                batch.append((r["building_id"], r["pnu"], item_id))
                if len(batch) >= BATCH:
                    cur.executemany(
                        f"update {table} set building_id=%s, pnu=%s where {id_col}=%s",
                        batch,
                    )
                    matched += len(batch)
                    batch = []
            if i % 1000 == 0:
                conn.commit()
                LOG.info(f"{kind}.progress {i}/{len(ids)} matched_so_far={matched}")
        if batch:
            cur.executemany(
                f"update {table} set building_id=%s, pnu=%s where {id_col}=%s",
                batch,
            )
            matched += len(batch)
    conn.commit()
    return matched


def rematch_buildings(conn, snap: Snapshot) -> None:
    biz_new = _rematch_chunked(conn, "businesses", "shop_id", "businesses", BUSINESS_MATCH_RADIUS_M)
    fac_new = _rematch_chunked(conn, "factories", "factory_id", "factories", BUILDING_MATCH_RADIUS_M)
    snap.counts["businesses_newly_matched"] = biz_new
    snap.counts["factories_newly_matched"] = fac_new

    with conn.cursor() as cur:
        cur.execute("select count(*) c from businesses where building_id is not null")
        snap.counts["businesses_matched_after"] = int(cur.fetchone()["c"])
        cur.execute("select count(*) c from factories where building_id is not null")
        snap.counts["factories_matched_after"] = int(cur.fetchone()["c"])
        cur.execute("select count(*) c from factories where geom is not null")
        snap.counts["factories_with_geom"] = int(cur.fetchone()["c"])


def main() -> int:
    snap = Snapshot(step="11_geocode_factories")
    conn = connect()
    try:
        if os.environ.get("SKIP_GEOCODE") != "1":
            try:
                geocode_factories(conn, snap)
            except Exception as exc:  # noqa: BLE001
                snap.warnings.append(f"geocode_failed: {exc}")
                LOG.warning(f"geocode_failed exc={exc} — proceeding to rematch")
        rematch_buildings(conn, snap)
        snap.save()
        snap.push_to_db(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
