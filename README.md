# 남동구 탄소지도 플랫폼 (Namdong-gu Carbon Map)

인천광역시 남동구를 시범 지역으로 한, **건물·지번 단위 정밀 탄소배출 지도 시뮬레이터**.

> ⚠️ MVP. AI 추정 인구는 의사라벨(SGIS 500m 격자 → 건물 단위 disaggregation) 기반이며,
> 건물별 탄소배출량은 지번 단위 전기·가스 사용량을 연면적 비율로 안분한 추정치입니다.

## What it does
1. **건물 클릭 → 상세 패널**: 지번/도로명주소, 토지용도, 업종, 전기·가스 사용량, 합계 CO₂ (kg/월).
2. **건물별 탄소 시각화**: CO₂ 5분위 빨강(고)~초록(저) 컬러 스케일.
3. **100m 격자 hotspot**: 건물 합계를 100×100m 격자로 집계, 고배출 지역 식별.
4. **업종 기반 액션 추천**: 음식점/공장/사무·소매/주거별 맞춤 액션 카드.
5. **AI 시뮬레이터**: 주용도·토지용도·상주인구 변경 시 예상 CO₂ Δ.

## Tech
- **Frontend**: Next.js 14 (App Router) + TypeScript + MapLibre GL JS + deck.gl + Tailwind + shadcn/ui
- **Backend**: Supabase (PostgreSQL 15 + PostGIS 3.4 + Storage)
- **AI**: XGBoost (dasymetric population) → ONNX → Vercel Edge Function 추론
- **Tiles**: PMTiles (tippecanoe)
- **ETL**: Python 3.11 + GeoPandas + Shapely + psycopg
- **Test**: Vitest + Playwright + pytest

## Quick start
```bash
cp .env.example .env.local              # fill in keys (see below)
pnpm install                             # web deps
uv venv && uv pip install -r etl/requirements.txt  # etl/ai deps

# 1) DB up
supabase start                           # local
supabase db push                         # apply migrations

# 2) ETL (1.1GB data → Supabase)
python etl/01_load_shapefiles.py
python etl/02_join_energy.py
python etl/02b_distribute_to_buildings.py
python etl/03_attach_attributes.py
python etl/04_sgis_population.py
python etl/05_compute_emissions.py
python etl/06_make_grid.py
bash etl/07_export_pmtiles.sh

# 3) AI
python ai/train.py
python ai/convert_onnx.py

# 4) Web
pnpm dev                                 # http://localhost:3000

# 5) Harness
python harness/eval_etl.py
python harness/eval_ai.py
pnpm playwright test
```

## Required environment variables
See `.env.example`. SGIS Open API 키는 [통계청 SGIS](https://sgis.kostat.go.kr/developer/) 에서 발급.

## Layout
| Path | What |
|---|---|
| `docs/PRD.md` | Product requirements |
| `docs/ARCHITECTURE.md` | System architecture |
| `docs/adr/` | Architecture Decision Records (Michael Nygard format) |
| `harness/` | Automated eval scripts |
| `etl/` | Python ETL pipeline |
| `ai/` | XGBoost model + ONNX export |
| `web/` | Next.js app |
| `supabase/` | Migrations + RPC |

## Status
- [x] Plan / PRD / Architecture / ADR
- [ ] G0 Repo & env scaffolding
- [ ] G1 DB migrations
- [ ] G2~G8 ETL pipeline
- [ ] G9~G12 Frontend features
- [ ] G13~G14 AI + simulator
- [ ] G15~G16 Observability + production deploy

## License
MIT (with data attribution: 국토교통부 V-World, 통계청 SGIS, 한국전력공사, 한국가스공사, 소상공인시장진흥공단, 인천광역시 남동구).

## Project context
인천광역시·남동구 AI 기반 도시 탄소배출 공간정보 플랫폼 시범구축. PDF "AI기반 도시 탄소배출 공간정보 플랫폼 구축 방안" 의 6대 기술(GIS, AI, 데이터처리, 원격탐사, Hotspot, WebGIS)을 남동구로 한정해 시범 구현.
