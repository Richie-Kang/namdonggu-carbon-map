"""ETL 02 — Load monthly 전기/가스 CSV → energy_monthly (PNU 단위).

Matching strategy (ADR-0015):
1. Try PNU direct (rare; CSVs only have address).
2. Normalize address → match parcels.address_jibun.
3. Fail-soft: collect unmatched into etl/reports/unmatched_addresses.csv.
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path
from typing import Iterable

import pandas as pd
from utils import LOG, Snapshot, connect, data_path, normalize_address

ELEC_DIR = data_path("7_전기 (지번 단위 월별)")
GAS_DIR = data_path("8_가스 (지번 단위 월별)")
SIGUNGU_NAMDONG = "28200"  # 인천 남동구 시군구코드 (행정안전부 5자리)


def iter_csvs(folder: Path) -> Iterable[Path]:
    return sorted(folder.glob("*.csv"))


def load_address_to_pnu(conn) -> dict[str, str]:
    with conn.cursor() as cur:
        cur.execute("select pnu, address_jibun from parcels where address_jibun is not null")
        rows = cur.fetchall()
    return {normalize_address(r["address_jibun"]): r["pnu"] for r in rows if r["address_jibun"]}


def detect_columns(df: pd.DataFrame) -> dict[str, str]:
    cols = {c.lower(): c for c in df.columns}
    return {
        "addr": cols.get("대지위치") or cols.get("address") or "",
        "yyyymm": cols.get("사용년월") or cols.get("yyyymm") or "",
        "amount": cols.get("사용량") or cols.get("kwh") or cols.get("amount") or "",
    }


def load_one(conn, path: Path, kind: str, addr_to_pnu: dict[str, str], snap: Snapshot) -> int:
    df = pd.read_csv(path, dtype=str)
    if df.empty:
        snap.warnings.append(f"empty_csv: {path.name}")
        return 0
    cols = detect_columns(df)
    if not (cols["addr"] and cols["yyyymm"] and cols["amount"]):
        snap.warnings.append(f"missing_columns: {path.name}")
        return 0

    inserted = 0
    unmatched: list[tuple[str, str]] = []

    with conn.cursor() as cur:
        for _, row in df.iterrows():
            raw_addr = str(row[cols["addr"]] or "")
            yyyymm = str(row[cols["yyyymm"]] or "").replace("-", "")[:6]
            if len(yyyymm) != 6 or not yyyymm.isdigit():
                continue
            try:
                amount = float(str(row[cols["amount"]] or "0").replace(",", "") or 0)
            except ValueError:
                amount = 0.0
            if amount < 0:
                amount = 0.0
            if amount > 1e7:  # cap unrealistic outliers
                snap.warnings.append(f"capped_outlier yyyymm={yyyymm} amount={amount}")
                amount = 1e7

            pnu = addr_to_pnu.get(normalize_address(raw_addr))
            if pnu is None:
                unmatched.append((raw_addr, yyyymm))
                continue

            if kind == "electricity":
                cur.execute(
                    "insert into energy_monthly (pnu, yyyymm, electricity_kwh, gas_m3) "
                    "values (%s, %s, %s, 0) "
                    "on conflict (pnu, yyyymm) do update set electricity_kwh = excluded.electricity_kwh",
                    (pnu, yyyymm, amount),
                )
            else:
                cur.execute(
                    "insert into energy_monthly (pnu, yyyymm, electricity_kwh, gas_m3) "
                    "values (%s, %s, 0, %s) "
                    "on conflict (pnu, yyyymm) do update set gas_m3 = excluded.gas_m3",
                    (pnu, yyyymm, amount),
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

    return inserted


def main() -> int:
    snap = Snapshot(step="02_join_energy")
    conn = connect()
    try:
        addr_to_pnu = load_address_to_pnu(conn)
        snap.counts["addr_to_pnu"] = len(addr_to_pnu)
        if not addr_to_pnu:
            snap.warnings.append("no_parcels_loaded — run 01 first")
            snap.save()
            return 1

        total_e = 0
        for p in iter_csvs(ELEC_DIR):
            total_e += load_one(conn, p, "electricity", addr_to_pnu, snap)
        snap.counts["electricity_rows"] = total_e

        total_g = 0
        for p in iter_csvs(GAS_DIR):
            total_g += load_one(conn, p, "gas", addr_to_pnu, snap)
        snap.counts["gas_rows"] = total_g

        # Match rate
        with conn.cursor() as cur:
            cur.execute("select count(distinct pnu) c from energy_monthly")
            matched_pnu = int(cur.fetchone()["c"])
            cur.execute("select count(*) c from parcels")
            total_pnu = int(cur.fetchone()["c"])
        match_rate = matched_pnu / max(total_pnu, 1)
        snap.metrics["pnu_match_rate"] = round(match_rate, 4)
        if match_rate < 0.5:
            snap.warnings.append(f"low_match_rate {match_rate:.2%}")

        snap.save()
        snap.push_to_db(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
