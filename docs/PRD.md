# PRD — 남동구 탄소지도 플랫폼

## Personas & Use Cases

| Persona | Goal | Critical Path |
|---|---|---|
| 남동구 환경정책 담당자 | hotspot 식별 → 우선순위 건물 추출 | 지도 진입 → 격자 hotspot → 빨강 격자 클릭 → 내부 건물 목록 |
| 에너지 컨설턴트 | 특정 건물 진단·액션 제안 | 건물 클릭 → 패널 → 추천 액션 |
| 연구원/학생 | 시뮬레이션·정책 효과 비교 | 시뮬레이터 슬라이더 → ΔCO₂ |
| 공장주(남동산단) | 자기 공장 배출량·개선 가능성 | 공장 검색 → 패널 → 폐열/태양광 추천 |

## User Stories (Acceptance Criteria 포함)

### US-1. 지도 진입
- URL 접속 → 남동구 행정경계 중심 지도가 ≤5초 로드
- 초기 zoom 12. 건물 레이어는 zoom ≥ 14에서만 렌더(성능)
- 베이스맵: OSM (1차), VWorld(옵션)
- **AC**: LCP ≤ 2.5s (4G), 건물 polygon count = 27,188 ± 1%

### US-2. 건물 클릭 → 상세 패널
- 우측 패널: 지번주소, 도로명주소, 토지용도(지목+주용도), 업종(상가/공장), 전기·가스 사용량(최근월 + 12개월), 합계 CO₂
- 누락 데이터: "—" + 툴팁("데이터 미보유" / "매칭 실패")
- **AC**: 패널 응답 ≤ 300ms, 콘솔 오류 0건

### US-3. 건물별 탄소 시각화
- CO₂/월 5분위 빨강~초록 컬러 (jet/viridis 토글)
- 범례 좌하단. monthly/annual 토글
- 데이터 없는 건물 회색(#9ca3af, opacity 0.3)
- **AC**: 5분위 분포 균등(각 20% ± 5%)

### US-4. 100m 격자 hotspot
- 줌 < 14: 건물 숨김, 격자만
- 격자값 = Σ(격자 내 건물 CO₂), 경계 걸친 건물은 면적 비율 안분
- 격자 클릭 → 상위 5개 건물 미니 패널
- **AC**: 격자 수 5,000–6,500개

### US-5. 업종 기반 액션 추천
- 패널에 액션 카드 1–3개 (액션명 + 1줄 설명 + 절감 비율 상수)
- 매칭:
  - 음식점/카페 → LED, 폐열회수 환기, 인덕션
  - 사무/소매 → LED, 옥상 태양광, 고효율 공조
  - 공장 → 폐열처리기, 태양광, 인버터 모터
  - 주거 → LED, 베란다 태양광, 단열 창호
  - 미분류 → LED, 단열
- **AC**: 모든 건물에 ≥1개 카드

### US-6. AI 시뮬레이터
- 슬라이더: 주용도(드롭다운), 토지용도(드롭다운), 상주인구(±200%)
- 디바운스 300ms → `/api/predict` → 예상 CO₂ + Δ
- **AC**: 응답 ≤ 800ms, 예측값 [0, 10×current] 클램프

## Functional Requirements

| ID | 요구 | 우선순위 |
|---|---|---|
| FR-01 | 건물 폴리곤 27,188개 표시 | P0 |
| FR-02 | 지번 단위 전기·가스 → 건물 안분 적재 | P0 |
| FR-03 | 건물 클릭 → 상세 패널 | P0 |
| FR-04 | 100m 격자 hotspot | P0 |
| FR-05 | 업종 기반 액션 추천 (룰 베이스) | P0 |
| FR-06 | AI 인구 예측 + 시뮬레이션 | P0 |
| FR-07 | 평가 harness (ETL/AI/E2E) | P0 |
| FR-08 | 데이터 새로고침 워크플로 (월별) | P1 |
| FR-09 | 다국어(ko, en) | P2 |
| FR-10 | 즐겨찾기·공유 링크 | P2 |
| FR-11 | 인증/관리자 모드 | P3 |
| FR-12 | 모바일 최적화 | P1 |

## Non-Functional Requirements

| 카테고리 | 요구 |
|---|---|
| Performance | LCP ≤ 2.5s, 패널 ≤ 300ms, 시뮬 ≤ 800ms, fps ≥ 30 |
| Scalability | 27k 건물. 인천 8개 구 확장 시 ~50만 대응 |
| Availability | Vercel 99.99% + Supabase 무료(no SLA) |
| Security | RLS read-only anon, CORS 화이트리스트, zod 입력 검증 |
| Privacy | 격자 인구만 노출. 건물 인구 ±10% 노이즈 옵션 |
| Accessibility | WCAG AA, colorblind 대안(viridis), 키보드 navigation |
| i18n | ko 1차, 라벨 분리 |
| Browser | Chrome 110+, Safari 16+, Edge 110+, Firefox 110+ |
| Observability | Vercel Analytics + Sentry + Supabase Logs |

## Out of Scope (MVP)
인천 외 확장, 교통/차량 탄소, 위성 분석, 측정기 연동, 사용자 계정·결제, 자동 재학습 MLOps

## Success Metrics
| Metric | Target |
|---|---|
| PNU 매칭율 (energy ↔ parcel) | ≥ 90% |
| AI 격자합계 제약 위반율 | ≤ 15% |
| E2E smoke 통과 | 100% |
| Vercel 빌드 | ≤ 5분 |
| Supabase DB | ≤ 400MB |
| LCP | ≤ 2.5s |
| Lighthouse Performance | ≥ 80 |

## Constraints
- 수도·지역난방 데이터 부재 → UI에서 제외
- SGIS API 키는 사용자 발급
- Supabase 무료 티어 500MB / 50 동시 conn
- Vercel Hobby 함수 50MB

## Roadmap
| M | 목표 | 검증 |
|---|---|---|
| M0 | 환경 세팅 | `pnpm dev` 200 |
| M1 | ETL 1단계 | row count |
| M2 | ETL 2단계 | 매칭율 ≥ 90% |
| M3 | 지도 + 클릭 패널 | Playwright |
| M4 | 컬러 + 격자 hotspot | 분위 분포 |
| M5 | 액션 추천 | 모든 건물 ≥1 카드 |
| M6 | AI + 시뮬 | harness 통과 |
| M7 | 프로덕션 + 관찰성 | 24h 0 오류 |
