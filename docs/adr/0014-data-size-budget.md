# ADR-0014. Data Size Budget (Supabase Free Tier)

- Status: Accepted
- Date: 2026-05-26
- Supersedes: partial of ADR-0001

## Context
Supabase 무료 티어 500MB DB / 1GB Storage. 원본 데이터 1.1GB의 PostGIS 적재 후 실제 용량을 사전 측정해야 한다.

## Decision
**Hard budget: ≤ 400MB** (안전 margin 100MB).

**측정 단계**:
1. `etl/00_size_probe.py` — 100건 sample 적재 후 평균 row 크기 측정 → 전체 예상치 계산
2. 결과 `etl/reports/size_probe.json` 저장
3. 예상치 350MB 초과 시 자동 폴리곤 단순화 활성:
   - `ST_SimplifyPreserveTopology(geom, 0.5)` 적용 (단위: meter, EPSG:5186)
   - 면적 손실 ≤ 1% 검증
4. 그래도 400MB 초과 시 → **Storage로 이전**:
   - parcels.geom, buildings.geom을 GeoJSON 파일로 Supabase Storage에 저장
   - DB에는 PNU + 메타데이터만 보관
   - 지도 렌더는 PMTiles만 사용 (DB 쿼리는 속성용)

## Compliance Gates
- `harness/eval_etl.py`에 용량 측정 add: `SELECT pg_database_size(current_database())` 보고
- 빌드 시 400MB 초과 → CI fail
- 매 ETL 실행 후 snapshot에 `db_size_mb` 기록

## Consequences
- 측정 없이 적재 강행 차단
- 폴리곤 단순화 시 모바일 fps도 개선 (side effect)
- 초과 시 Storage 분리 fallback 사전 정의
