"""Shared ETL utilities (CLAUDE.md §Hard rules)."""
from __future__ import annotations

import json
import logging
import os
import re
import sys
import unicodedata
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT_ENV = os.getenv("NAMDONGGU_DATA_ROOT")
DEFAULT_DATA_ROOT = Path(
    DATA_ROOT_ENV
    or (PROJECT_ROOT / "data")
)

load_dotenv(PROJECT_ROOT / ".env.local")

LOG = logging.getLogger("etl")
logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
)


def db_dsn() -> str:
    dsn = os.environ.get("SUPABASE_DB_URL")
    if not dsn:
        raise RuntimeError("SUPABASE_DB_URL not set; see .env.example")
    return dsn


def connect() -> psycopg.Connection[psycopg.rows.DictRow]:
    return psycopg.connect(db_dsn(), row_factory=psycopg.rows.dict_row)


# --- snapshot --------------------------------------------------------------

@dataclass
class Snapshot:
    step: str
    run_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    counts: dict[str, int] = field(default_factory=dict)
    metrics: dict[str, float] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def save(self) -> Path:
        out = PROJECT_ROOT / "etl" / "reports" / f"{self.step}_{self.run_at.replace(':', '-')}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(asdict(self), ensure_ascii=False, indent=2), encoding="utf-8")
        LOG.info(f"snapshot written: {out}")
        return out

    def push_to_db(self, conn: psycopg.Connection[Any] | None = None) -> None:
        own = conn is None
        cn = conn or connect()
        try:
            with cn.cursor() as cur:
                cur.execute(
                    "insert into etl_snapshots (step, run_at, counts, metrics, warnings) "
                    "values (%s, %s, %s, %s, %s)",
                    (
                        self.step,
                        self.run_at,
                        json.dumps(self.counts),
                        json.dumps(self.metrics),
                        json.dumps(self.warnings),
                    ),
                )
            cn.commit()
        finally:
            if own:
                cn.close()


# --- address normalization (ADR-0015) -------------------------------------

_WS_RE = re.compile(r"\s+")
_TRAIL_RE = re.compile(r"(번지|호)$")


def normalize_address(addr: str | None) -> str:
    if not addr:
        return ""
    s = unicodedata.normalize("NFKC", addr).strip()
    s = _WS_RE.sub(" ", s)
    s = _TRAIL_RE.sub("", s)
    return s


# --- PNU helpers ---------------------------------------------------------

_PNU_RE = re.compile(r"^\d{19}$")

def is_valid_pnu(pnu: str | None) -> bool:
    return bool(pnu and _PNU_RE.match(pnu))


def pnu_from_admin_jibun(sigungu: str, beopjeong: str, mountain: str, bon: str, bu: str) -> str:
    """행정구역코드 + 본번 + 부번 → 19자리 PNU.
    sigungu: 5자리, beopjeong: 5자리(법정동), mountain: 1자리(0:일반, 1:산),
    bon: 4자리, bu: 4자리.
    """
    return f"{sigungu:>05}{beopjeong:>05}{mountain:>01}{int(bon):04d}{int(bu):04d}"


# --- emission factors --------------------------------------------------------

ELEC_FACTOR_KG_PER_KWH = 0.4781
GAS_LNG_FACTOR_KG_PER_M3 = 2.176


def kg_co2(electricity_kwh: float, gas_m3: float) -> float:
    return electricity_kwh * ELEC_FACTOR_KG_PER_KWH + gas_m3 * GAS_LNG_FACTOR_KG_PER_M3


# --- guards ----------------------------------------------------------------

def fail(msg: str, **ctx: Any) -> None:
    payload = json.dumps({"fatal": msg, **ctx}, ensure_ascii=False)
    LOG.error(payload)
    sys.exit(1)


def require_env(*names: str) -> None:
    missing = [n for n in names if not os.environ.get(n)]
    if missing:
        fail("missing_env", names=missing)


# --- small helpers ---------------------------------------------------------

def data_path(*parts: str) -> Path:
    return DEFAULT_DATA_ROOT.joinpath(*parts)
