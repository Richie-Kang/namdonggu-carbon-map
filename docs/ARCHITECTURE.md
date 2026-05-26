# Architecture — 남동구 탄소지도

## System Context

```
                          ┌──────────────────┐
                          │  사용자 (브라우저)    │
                          └──────┬───────────┘
                                 │ HTTPS
                                 ▼
            ┌──────────────────────────────────┐
            │  Vercel (Edge CDN + Next.js 14)         │
            │  ├─ /                  (지도 SSR shell)   │
            │  ├─ /api/predict       (Edge, ONNX.js)    │
            │  ├─ /api/aggregate     (Edge, PostGIS RPC)│
            │  ├─ /api/buildings     (Edge, bbox query) │
            │  ├─ /api/grid          (Edge, bbox query) │
            │  ├─ /api/health        (Edge, ping)       │
            │  └─ /public/tiles/*.pmtiles (정적)        │
            └────────────┬─────────────────────┘
                         │  Service Role / Anon Key
                         ▼
            ┌──────────────────────────────────┐
            │  Supabase                                │
            │  ├─ PostgreSQL 15 + PostGIS 3.4          │
            │  ├─ Storage (PMTiles, ONNX model)        │
            │  └─ RLS 정책 / 무료 티어 자동 백업          │
            └──────────────────────────────────┘
                         ▲
                         │  COPY / psql (1회성)
            ┌────────────┴─────────────────────┐
            │  로컬 ETL (Python 3.11)                  │
            │  ├─ shp → GeoJSON (EPSG 5186 → 4326)    │
            │  ├─ CSV 정제 → Parquet                   │
            │  ├─ SGIS API 다운로드                     │
            │  ├─ XGBoost 학습 → ONNX                  │
            │  └─ tippecanoe → PMTiles                 │
            └──────────────────────────────────┘
```

## Sequence — 건물 클릭
```
Browser ─click(lng,lat)→ Map.tsx
Map.tsx ─click feature→ {pnu, building_id}
Map.tsx ─fetch('/api/aggregate?building_id=...')→ Edge
Edge ─supabase.rpc('get_building_detail', {p_building_id})→ Postgres
Postgres ─SELECT b, e, attr, recommendation JSONB─→ Edge
Edge ─JSON─→ Browser
BuildingPanel.tsx ─render→ user
```

## Sequence — 시뮬레이션
```
SimulatorPanel ─debounce(300ms)→ /api/predict
/api/predict ─loadONNX(cached) → input vector (zod validated)
ONNX ─infer→ pop_pred
/api/predict ─pop→co2 (α,β per use_code) → co2_pred
/api/predict ─JSON {co2_pred, delta_kg, breakdown, warnings}→ panel
panel ─render Δ + chart→ user
```

## Component Diagram (Front-end)
```
app/page.tsx
  ├─ <TopBar />            (검색, 언어, share)
  ├─ <Map />               ← MapLibre + deck.gl
  │   ├─ <BuildingsLayer />
  │   ├─ <GridLayer />
  │   └─ <Legend />
  ├─ <BuildingPanel />
  │   ├─ <AddressBlock />
  │   ├─ <EnergyChart />
  │   ├─ <CO2Total />
  │   └─ <ActionRecommender />
  └─ <SimulatorPanel />
      ├─ <UseSelect />
      ├─ <LandUseSelect />
      ├─ <PopulationSlider />
      └─ <DeltaCard />
```

## Supabase Schema (요약)
- `parcels(pnu PK, jibun, address_*, jimok, geom)`
- `buildings(building_id PK, pnu FK, name, use_main, use_main_code, floors_*, area_*, height_m, approved_at, geom, centroid, co2_kg_month, co2_quintile)`
- `energy_monthly(pnu, yyyymm, electricity_kwh, gas_m3, source)`
- `building_energy(building_id, yyyymm, electricity_kwh, gas_m3, co2_kg)`
- `businesses(shop_id PK, industry_*, pnu, building_id, geom)`
- `factories(factory_id PK, industry_*, employees, address_jibun, building_id, geom)`
- `grid_100m(grid_id PK, geom, co2_kg_month, co2_quintile, population_pred)`
- `grid_500m_pop(grid_id PK, geom, population, source, fetched_at)`
- `emission_factors(source PK, factor, unit, reference, effective_from)`
- `land_use_lookup(code PK, ko_name, category)`

전체 DDL은 `supabase/migrations/0001_init.sql` 참조.

## API Contracts

| Endpoint | Method | Input | Output | 실패 |
|---|---|---|---|---|
| `/api/buildings?bbox=W,S,E,N` | GET | bbox | `{features: GeoJSON FC}` | 400, 500 |
| `/api/aggregate?building_id=X` | GET | id | `{building, energy[12], businesses[], recommendation[]}` | 404, 500 |
| `/api/grid?bbox=...` | GET | bbox | `{cells: GeoJSON FC}` | 400, 500 |
| `/api/predict` | POST | `{building_id, use_main_code, land_use_category, pop_delta_pct}` | `{co2_pred, delta_kg, breakdown, model_version, warnings?}` | 400, 503 |
| `/api/health` | GET | — | `{db, model, tiles}` | — |

zod schemas in `web/lib/zod-schemas.ts`.

## Caching

| 자원 | 위치 | TTL | Invalidation |
|---|---|---|---|
| PMTiles | Vercel CDN | immutable 1y | filename hash |
| `/api/buildings` | Edge cache `s-maxage=300` | 5분 | 재배포 |
| `/api/aggregate` | `s-maxage=60, swr=300` | 1분 | — |
| ONNX model | Edge memory | 영구 | 빌드 |
| Supabase RPC | SWR client | 1분 | manual |

## State
- Global: Zustand (`selected_building`, `sim_inputs`, `layer_visibility`, `color_scheme`)
- Server: SWR (`useSWR`)
- Map: MapLibre/deck.gl internal + Zustand bridge

## Performance budgets
| 지표 | 예산 |
|---|---|
| JS bundle (initial) | ≤ 350KB gz |
| 지도 첫 페인트 | ≤ 1.5s |
| LCP | ≤ 2.5s |
| TBT | ≤ 200ms |
| CLS | ≤ 0.05 |
| Building 폴리곤 렌더 (zoom 14) | 30 fps |
| `/api/aggregate` p95 | ≤ 300ms |
| `/api/predict` p95 | ≤ 800ms |

## Security
- Anon key read-only via RLS; service_role local only
- SGIS API key는 서버 환경변수
- CORS allow-list: Vercel domain + localhost
- 모든 쿼리 파라미터 zod
- SQL injection 차단: RPC + 파라미터 바인딩 only, raw SQL 금지
- Edge middleware rate limit 60/min/IP
- CSP 헤더 설정 (`web/next.config.mjs`)
- Sentry source map upload token 서버 한정

## Observability
- 로깅: structured JSON → Vercel Logs
- 메트릭: Vercel Analytics (Web Vitals)
- 에러: Sentry SDK (traces sample 10%)
- 알람: Sentry 통합 (5xx > 1% 시)

## Environments
| 환경 | URL | DB |
|---|---|---|
| local | `localhost:3000` | local Supabase or dev |
| preview | Vercel preview | dev DB |
| production | `<custom>.vercel.app` | prod DB |

## CI/CD
GitHub Actions:
- `lint`: pnpm lint + typecheck
- `test`: vitest + playwright
- `etl-validate`: harness/eval_etl.py (data 변경 시)
- `deploy`: main push → Vercel

## Backup
- Supabase 7-day 자동 백업
- 주 1회 `pg_dump` 로컬 보관
- PMTiles는 Git LFS or S3 (≥100MB 시)
