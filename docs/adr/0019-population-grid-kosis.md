# ADR-0019. Population Grid: KOSIS 100m 다사 (replaces SGIS API)

- Status: Accepted
- Date: 2026-05-26
- Supersedes: ADR-0004 §라벨 생성 (격자 단위), ETL 04 SGIS API

## Context
사용자가 통계청 KOSIS **2024년 100m 다사 격자 인구** 데이터를 직접 제공함:
- `data/9_인구밀도/extracted/grid/grid_다사_100M.{shp,…}` (EPSG:5179, 전국)
- `data/9_인구밀도/extracted/census/2024년_인구_다사_100M.csv` (CP949, long-format)

이전 plan은 SGIS Open API를 호출해 500m 격자 인구를 수집했음. 외부 API 키 발급·rate limit·schema drift 위험이 있었고, 라벨 해상도가 500m로 거칠어 의사라벨 노이즈가 컸음.

## Decision
1. **새 테이블 `grid_pop_100m`** — `grid_cd PK, geom(Polygon, 4326), population, population_0_14, population_15_64, population_65_up, year, source`. RLS read-only anon.
2. **`etl/04_load_population_grid.py`** 신규 — Shapefile + CSV 로드, EPSG:5179 → 4326 변환, buildings extent ±2km로 클리핑, `to_in_001` 만 추출.
3. **기존 `04_sgis_population.py` deprecated** — 코드는 보존, 헤더에 DEPRECATED 명시.
4. **`grid_500m_pop`** — 마이그레이션에서 코멘트로 deprecated 표시. 후속에서 drop 가능.
5. **AI 학습** — `ai/features.py`와 `ai/train.py`가 `grid_pop_100m` 참조. 격자 해상도 500m → 100m로 16배 작아져 의사라벨 노이즈↓.

## Alternatives
- ① SGIS API 유지: 외부 의존성·rate limit
- ② 인구주택총조사 동·읍·면 단위: 해상도 너무 거침
- ③ 위성 야간조도 회귀: PDF 보조 데이터, MVP 외

## Consequences
- 외부 API 키 불필요 → 사용자 작업 1건 감소
- 라벨 해상도 5배 향상 (500m → 100m)
- 의사라벨이 ground truth에 훨씬 가까워져 `R² ≥ 0.4` 게이트 달성 가능성↑
- 데이터 크기: 100m 격자는 남동구 약 5,000~6,000셀 (관리 가능)
- CRS 변환 비용 1회성 (ETL 04)
- 사용자가 다른 연도 데이터를 추가하면 동일 스크립트로 재실행 가능 (year 컬럼)

## Compliance Gates
- `harness/eval_etl.py` 가 `grid_pop_100m` count > 0 검증 (TODO)
- ADR-0004 grid_violation 임계 0.15는 그대로 유지, 단 더 작은 격자라 만족 쉬워질 것
