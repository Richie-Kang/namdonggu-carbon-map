"""ETL 04 — Fetch SGIS 격자 인구 (남동구) via Open API and store as grid_500m_pop.

SGIS: https://sgis.kostat.go.kr/developer/
Endpoint: /OpenAPI3/grid/population.json  (sample; adapt to actual API doc)
Requires SGIS_CONSUMER_KEY + SGIS_CONSUMER_SECRET.

If keys are missing → write empty snapshot + non-fatal exit so downstream
스크립트 (05, 06) can still run on dummy population (P1: 더미 데이터 사용).
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any

import requests
from tenacity import retry, stop_after_attempt, wait_exponential
from utils import LOG, Snapshot, connect

SGIS_BASE = "https://sgisapi.kostat.go.kr/OpenAPI3"
NAMDONG_ADM_CD = "28200"  # 인천 남동구


@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=1, max=16))
def fetch_access_token(key: str, secret: str) -> str:
    r = requests.get(
        f"{SGIS_BASE}/auth/authentication.json",
        params={"consumer_key": key, "consumer_secret": secret},
        timeout=10,
    )
    r.raise_for_status()
    payload: dict[str, Any] = r.json()
    if payload.get("errCd") not in (0, "0"):
        raise RuntimeError(f"sgis_auth_failed: {payload}")
    return payload["result"]["accessToken"]


@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=1, max=16))
def fetch_grid_page(token: str, page: int, per_page: int = 100) -> list[dict[str, Any]]:
    # NOTE: SGIS API param names may differ; verify against developer console.
    r = requests.get(
        f"{SGIS_BASE}/stats/grid.json",
        params={
            "accessToken": token,
            "adm_cd": NAMDONG_ADM_CD,
            "grid": "GRID_500M",
            "var": "to_in_001",  # 총인구
            "page": page,
            "per_page": per_page,
        },
        timeout=30,
    )
    r.raise_for_status()
    payload = r.json()
    if payload.get("errCd") not in (0, "0"):
        raise RuntimeError(f"sgis_grid_failed: {payload}")
    return payload.get("result", []) or []


def main() -> int:
    snap = Snapshot(step="04_sgis_population")
    key = os.environ.get("SGIS_CONSUMER_KEY")
    secret = os.environ.get("SGIS_CONSUMER_SECRET")
    if not (key and secret):
        snap.warnings.append("SGIS keys missing — skipping (run with keys to populate)")
        snap.save()
        LOG.warning("SGIS keys missing; downstream uses dummy population")
        return 0

    token = fetch_access_token(key, secret)
    LOG.info("sgis.auth ok")

    conn = connect()
    inserted = 0
    try:
        with conn.cursor() as cur:
            cur.execute("truncate grid_500m_pop")
            page = 1
            while True:
                rows = fetch_grid_page(token, page)
                if not rows:
                    break
                for row in rows:
                    grid_id = str(row.get("grid_id") or row.get("gid"))
                    pop = int(row.get("to_in_001") or row.get("population") or 0)
                    # SGIS returns geometry as WKT or coords; assume WKT
                    wkt = row.get("geom_wkt") or row.get("wkt")
                    if not wkt:
                        continue
                    cur.execute(
                        "insert into grid_500m_pop (grid_id, geom, population, source) "
                        "values (%s, st_geomfromtext(%s, 4326), %s, 'sgis')",
                        (grid_id[:24], wkt, pop),
                    )
                    inserted += 1
                page += 1
                if page > 200:  # safety
                    snap.warnings.append("page_limit_hit")
                    break
        conn.commit()
        snap.counts["grid_500m_inserted"] = inserted
        snap.save()
        snap.push_to_db(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
