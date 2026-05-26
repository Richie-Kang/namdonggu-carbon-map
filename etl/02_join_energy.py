"""ETL 02 — Load monthly 전기/가스 CSV → energy_monthly (PNU 단위).

CSVs (one per month) carry 시군구코드/법정동코드/대지구분코드/번/지 columns,
not a direct PNU.  We compose the 19-digit PNU from those 5 fields and join
against `parcels.pnu` directly.  Address-based fallback is reserved for rows
whose PNU does not exist in the parcel table (rare boundary cases).
"""
from __future__ import annotations

import csv
import sys
from decimal import Decimal
from pathlib import Path
from typing import Iterable

import pandas as pd
from utils import (
    LOG,
    Snapshot,
    connect,
    data_path,
    normalize_address,
    pnu_from_admin_jibun,
)

ELEC_DIR = data_path("7_전기 (지번 단위 월별)")
GAS_DIR = data_path("8_가스 (지번 단위 월별)")


def iter_csvs(folder: Path) -> Iterable[Path]:
    return sorted(folder.glob("*.csv"))


def load_parcel_keys(conn) -> tuple[set[str], dict[str, str]]:
    with conn.cursor() as cur:
        cur.execute("select pnu, address_jibun from parcels")
        rows = cur.fetchall()
    valid = {r["pnu"] for r in rows}
    addr_to_pnu = {normalize_address(r["address_jibun"]): r["pnu"]
                   for r in rows if r["address_jibun"]}
    return valid, addr_to_pnu


def compose_pnu(sgg: str, bj: str, kind: str, bon: str, bu: str) -> str | None:
    # CSV 대지구분코드 (0=일반, 1=산) → PNU 토지구분 (1=일반, 2=산).
    # Verified against parcels.pnu rows for 남동구 구월동 4-* (samples show
    # the 11th char = 1 for ordinary lots).
    try:
        kind_norm = (kind or "0").strip()
        pnu_kind = "2" if kind_norm == "1" else "1"
        return pnu_from_admin_jibun(
            sgg.strip(), bj.strip(), pnu_kind, bon.strip(), bu.strip()
        )
    except (ValueError, TypeError):
        return None


def load_one(
    conn,
    path: Path,
    kind: str,
    valid_pnus: set[str],
    addr_to_pnu: dict[str, str],
    snap: Snapshot,
) -> int:
    df = pd.read_csv(path, dtype=str)
    if df.empty:
        snap.warnings.append(f"empty_csv: {path.name}")
        return 0
    # strip BOM and surrounding whitespace from column names
    df.columns = [c.strip().lstrip("﻿") for c in df.columns]

    required = ["시군구코드", "법정동코드", "대지구분코드", "번", "지", "사용년월", "사용량(KWh)", "대지위치"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        snap.warnings.append(f"missing_columns {path.name} missing={missing}")
        return 0

    inserted = 0
    by_pnu = 0
    by_addr = 0
    unmatched: list[tuple[str, str]] = []

    with conn.cursor() as cur:
        for _, row in df.iterrows():
            yyyymm = str(row["사용년월"] or "").replace("-", "")[:6]
            if len(yyyymm) != 6 or not yyyymm.isdigit():
                continue
            try:
                amount = float(str(row["사용량(KWh)"] or "0").replace(",", "") or 0)
            except ValueError:
                amount = 0.0
            if amount < 0:
                amount = 0.0
            if amount > 1e7:
                snap.warnings.append(f"capped_outlier {path.name} yyyymm={yyyymm} amount={amount}")
                amount = 1e7

            pnu = compose_pnu(
                row["시군구코드"], row["법정동코드"], row["대지구분코드"],
                row["번"], row["지"],
            )
            if pnu and pnu in valid_pnus:
                by_pnu += 1
            else:
                raw_addr = str(row["대지위치"] or "")
                fallback = addr_to_pnu.get(normalize_address(raw_addr))
                if fallback:
                    pnu = fallback
                    by_addr += 1
                else:
                    unmatched.append((raw_addr, yyyymm))
                    continue

            elec = Decimal(repr(amount)) if kind == "electricity" else Decimal(0)
            gas = Decimal(repr(amount)) if kind == "gas" else Decimal(0)
            cur.execute(
                "insert into energy_monthly (pnu, yyyymm, electricity_kwh, gas_m3) "
                "values (%s, %s, %s, %s) "
                "on conflict (pnu, yyyymm) do update set "
                "  electricity_kwh = energy_monthly.electricity_kwh + excluded.electricity_kwh, "
                "  gas_m3 = energy_monthly.gas_m3 + excluded.gas_m3 "
                "where energy_monthly.pnu = excluded.pnu",
                (pnu, yyyymm, elec, gas),
            )
            inserted += 1
    conn.commit()

    if unmatched:
        report_path = Path(__file__).resolve().parent / "reports" / f"unmatched_{kind}_{path.stem}.csv"
        report_path.parent.mkdir(exist_ok=True)
        with report_path.open("w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(["address_raw", "yyyymm"])
            w.writerows(unmatched)
        snap.counts[f"unmatched_{kind}_{path.stem}"] = len(unmatched)

    snap.counts[f"matched_pnu_{kind}_{path.stem}"] = by_pnu
    snap.counts[f"matched_addr_{kind}_{path.stem}"] = by_addr
    LOG.info(f"{kind} {path.name} inserted={inserted} pnu={by_pnu} addr={by_addr} unmatched={len(unmatched)}")
    return inserted


def main() -> int:
    snap = Snapshot(step="02_join_energy")
    conn = connect()
    try:
        valid_pnus, addr_to_pnu = load_parcel_keys(conn)
        snap.counts["valid_pnus"] = len(valid_pnus)
        if not valid_pnus:
            snap.warnings.append("no_parcels — run ETL 01 first")
            snap.save()
            return 1

        with conn.cursor() as cur:
            cur.execute("truncate energy_monthly cascade")
        conn.commit()

        total_e = 0
        for p in iter_csvs(ELEC_DIR):
            total_e += load_one(conn, p, "electricity", valid_pnus, addr_to_pnu, snap)
        snap.counts["electricity_rows"] = total_e

        total_g = 0
        for p in iter_csvs(GAS_DIR):
            total_g += load_one(conn, p, "gas", valid_pnus, addr_to_pnu, snap)
        snap.counts["gas_rows"] = total_g

        with conn.cursor() as cur:
            cur.execute("select count(distinct pnu) c from energy_monthly")
            matched_pnu = int(cur.fetchone()["c"])
            cur.execute("select count(*) c from parcels")
            total_pnu = int(cur.fetchone()["c"])
            cur.execute("select count(distinct yyyymm) c, min(yyyymm) mn, max(yyyymm) mx from energy_monthly")
            tm = cur.fetchone()
        match_rate = matched_pnu / max(total_pnu, 1)
        snap.metrics["pnu_match_rate"] = round(match_rate, 4)
        snap.metrics["distinct_months"] = int(tm["c"])
        snap.metrics["yyyymm_min"] = tm["mn"]
        snap.metrics["yyyymm_max"] = tm["mx"]

        if match_rate < 0.5:
            snap.warnings.append(f"low_match_rate {match_rate:.2%}")

        LOG.info(f"match_rate={match_rate:.3f} months={tm['c']} ({tm['mn']}~{tm['mx']})")
        snap.save()
        snap.push_to_db(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
