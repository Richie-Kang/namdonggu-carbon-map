# 🗺️ 남동구 탄소지도 플랫폼

인천광역시 남동구의 건물별 탄소배출량을 지도로 시각화하고 시뮬레이션하는 웹 서비스.

> ⚠️ **MVP 고지** — 건물별 CO₂는 지번 단위 전기·가스 사용량을 연면적 비율로 안분한 추정치입니다.
> AI 인구 추정은 KOSIS 100m 격자 → 건물 단위 다사메트릭 배분(연면적 비율로 격자 인구를 건물에 쪼개는 추정 기법) 기반이며 측정값이 아닙니다.

## ✨ 주요 기능

- 🏠 **건물 클릭 → 상세 패널** — 주소·용도·업종, 월별 전기·가스 사용량, CO₂ (kg/월)
- 🌡️ **탄소배출 주제도** — CO₂ 5분위 컬러 스케일 (초록 낮음 → 빨강 높음)
- 🔥 **100m 격자 핫스팟** — 건물 합계를 격자로 집계해 고배출 지역 식별
- 🎛️ **시뮬레이터** — 주용도·토지용도·인구 변경 시 예상 CO₂ 변화량
- 🤖 **AI 보고서** — 업종 기반 맞춤 감축 액션 추천

## 🛠️ 스택

| 영역 | 기술 |
|---|---|
| Frontend | Next.js 14 (App Router) · TypeScript strict · Tailwind CSS |
| 지도 | MapLibre GL 4 · deck.gl 9 · PMTiles |
| Backend / DB | Supabase (PostgreSQL + PostGIS + RLS) |
| 상태 관리 | Zustand · SWR |
| AI 추론 | XGBoost → ONNX Runtime (Node) |
| ETL | Python 3.11 · GeoPandas · psycopg |
| 테스트 | Vitest · Playwright · pytest |

## 🚀 로컬 실행

### 프론트엔드만 (권장)

PMTiles가 레포에 포함되어 있어 ETL 없이 바로 실행됩니다.

```bash
cd web
pnpm install
pnpm dev
```

`http://localhost:3000`

### 전체 파이프라인

```bash
# 환경 변수 설정
cp .env.example .env.local   # 키 입력

# 의존성
pnpm install
uv venv && uv pip install -r etl/requirements.txt

# DB
supabase start
supabase db push

# ETL
python etl/01_load_shapefiles.py
python etl/02_join_energy.py
python etl/02b_distribute_to_buildings.py
python etl/03_attach_attributes.py
python etl/04_load_population_grid.py    # KOSIS 100m 격자 ZIP → data/9_인구밀도/
python etl/05_compute_emissions.py
python etl/06_make_grid.py
bash   etl/07_export_pmtiles.sh

# AI 모델
python ai/train.py
python ai/convert_onnx.py

# 웹
pnpm dev

# 검증
python harness/eval_etl.py
python harness/eval_ai.py
pnpm playwright test
```

## 🔑 환경 변수

`.env.example` 참고. 필수 항목:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY      # ETL용
SUPABASE_DB_URL                # psycopg 연결
```

SGIS API 키는 더 이상 필수가 아닙니다 (ADR-0019: KOSIS 로컬 적재로 대체).

## 📁 파일 구조

```
namdonggu-carbon-map/
├── web/              Next.js 14 앱
│   ├── app/          라우트 + API handlers
│   ├── components/   UI 컴포넌트
│   └── lib/          상수·유틸 (배출계수, 색상, 테마)
├── etl/              Python ETL 파이프라인 (01~07)
├── ai/               XGBoost 학습 + ONNX 변환
├── harness/          데이터·AI·E2E 검증 스크립트
├── supabase/         마이그레이션 + RPC + RLS
└── docs/             PRD · ARCHITECTURE · ADR
```

## 📊 데이터 출처

| 출처 | 용도 |
|---|---|
| 국토교통부 V-World | 건물·지번 셰이프파일 |
| 한국전력공사 · 한국가스공사 | 지번별 월간 전기·가스 사용량 |
| 통계청 KOSIS | 100m 인구밀도 격자 |
| 소상공인시장진흥공단 | 업종·사업체 정보 |

배출계수(전기 0.4579 kgCO₂/kWh, 도시가스 2.176 kgCO₂/m³)는 `web/lib/emission-factors.ts`와 `etl/utils.py`에서 관리합니다.

## 📄 라이선스

MIT
