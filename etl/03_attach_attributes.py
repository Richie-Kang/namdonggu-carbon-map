"""ETL 03 — Load businesses (file 5) + factories (file 6) and match to buildings.

- businesses: have lon/lat → ST_Within building polygons
- factories: only addresses → normalize → parcels.address_jibun match
"""
from __future__ import annotations

import sys

import pandas as pd
from utils import LOG, Snapshot, connect, data_path, normalize_address

BUSINESS_CSV = data_path(
    "5_업종_상가정보_소상공인시장진흥공단_상가(상권)정보_인천_202603_인코딩 문제 해결.csv"
)
FACTORY_CSV = data_path(
    "6_업종_남동산단 입주기업_인천광역시 남동구_공장등록현황_20250321_인코딩 문제 해결.csv"
)
SIGUNGU_NAMDONG_CODE = "28200"


def load_businesses(conn, snap: Snapshot) -> None:
    df = pd.read_csv(BUSINESS_CSV, dtype=str)
    # Filter to 남동구
    sigungu_col = next((c for c in df.columns if "시군구코드" in c), None)
    if sigungu_col:
        df = df[df[sigungu_col] == SIGUNGU_NAMDONG_CODE].copy()
    LOG.info(f"businesses.read rows={len(df)}")

    lon_col = next((c for c in df.columns if c.lower() in ("경도", "lon", "longitude", "x")), None)
    lat_col = next((c for c in df.columns if c.lower() in ("위도", "lat", "latitude", "y")), None)
    id_col = next((c for c in df.columns if "상가업소번호" in c), None) or df.columns[0]
    name_col = next((c for c in df.columns if c in ("상호명", "name")), None)
    ksic_col = next((c for c in df.columns if "표준산업분류" in c and "코드" in c), None)
    ksic_name_col = next((c for c in df.columns if "표준산업분류" in c and "명" in c), None)

    inserted = 0
    with conn.cursor() as cur:
        cur.execute("truncate businesses")
        for _, row in df.iterrows():
            try:
                lon = float(row[lon_col]) if lon_col else None
                lat = float(row[lat_col]) if lat_col else None
            except (TypeError, ValueError):
                lon, lat = None, None
            if lon is None or lat is None or not (125 < lon < 128 and 36 < lat < 38):
                continue
            sid = str(row[id_col])[:200]
            name = str(row[name_col]) if name_col else None
            ksic = str(row[ksic_col]) if ksic_col else None
            ksic_name = str(row[ksic_name_col]) if ksic_name_col else None
            cur.execute(
                "insert into businesses (shop_id, name, industry_code, industry_name, geom) "
                "values (%s, %s, %s, %s, st_setsrid(st_makepoint(%s, %s), 4326)) "
                "on conflict (shop_id) do nothing",
                (sid, name, ksic, ksic_name, lon, lat),
            )
            inserted += 1
        # Match to buildings via ST_Contains (centroid in building polygon).
        cur.execute("""
            update businesses b
            set building_id = bd.building_id,
                pnu = bd.pnu
            from buildings bd
            where bd.geom && b.geom
              and st_contains(bd.geom, b.geom)
              and b.building_id is null
        """)
        cur.execute("select count(*) c from businesses where building_id is not null")
        matched = int(cur.fetchone()["c"])
    conn.commit()
    snap.counts["businesses_inserted"] = inserted
    snap.counts["businesses_matched_to_building"] = matched


def load_factories(conn, snap: Snapshot) -> None:
    df = pd.read_csv(FACTORY_CSV, dtype=str)
    LOG.info(f"factories.read rows={len(df)}")
    id_col = df.columns[0]
    name_col = next((c for c in df.columns if "회사명" in c), None)
    addr_col = next((c for c in df.columns if "공장대표주소" in c and "지번" in c), None)
    emp_col = next((c for c in df.columns if "종업원" in c), None)
    ind_col = next((c for c in df.columns if "업종번호" in c), None)
    ind_name_col = next((c for c in df.columns if "업종명" in c), None)

    inserted = 0
    matched = 0
    with conn.cursor() as cur:
        # Build address → pnu cache
        cur.execute("select pnu, address_jibun from parcels where address_jibun is not null")
        addr_to_pnu = {normalize_address(r["address_jibun"]): r["pnu"] for r in cur.fetchall()}

        cur.execute("truncate factories")
        for _, row in df.iterrows():
            fid = str(row[id_col])[:200]
            name = str(row[name_col]) if name_col else None
            addr = str(row[addr_col]) if addr_col else None
            try:
                emp = int(row[emp_col]) if emp_col and row[emp_col] else None
            except (TypeError, ValueError):
                emp = None
            ind = str(row[ind_col]) if ind_col else None
            ind_name = str(row[ind_name_col]) if ind_name_col else None

            pnu = addr_to_pnu.get(normalize_address(addr)) if addr else None
            if pnu:
                matched += 1
            cur.execute(
                "insert into factories (factory_id, name, industry_code, industry_name, "
                "employees, address_jibun, pnu) "
                "values (%s, %s, %s, %s, %s, %s, %s) "
                "on conflict (factory_id) do nothing",
                (fid, name, ind, ind_name, emp, addr, pnu),
            )
            inserted += 1
        # P1 fix: deterministically pick largest-area_total building per pnu.
        cur.execute("""
            with picked as (
                select distinct on (b.pnu) b.pnu, b.building_id, b.centroid
                from buildings b
                where b.pnu is not null
                order by b.pnu, b.area_total desc nulls last, b.building_id
            )
            update factories f
            set building_id = picked.building_id,
                geom = coalesce(f.geom, picked.centroid)
            from picked
            where picked.pnu = f.pnu
              and f.building_id is null;
        """)
    conn.commit()
    snap.counts["factories_inserted"] = inserted
    snap.counts["factories_matched_to_pnu"] = matched


def main() -> int:
    snap = Snapshot(step="03_attach_attributes")
    conn = connect()
    try:
        load_businesses(conn, snap)
        load_factories(conn, snap)
        snap.save()
        snap.push_to_db(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
