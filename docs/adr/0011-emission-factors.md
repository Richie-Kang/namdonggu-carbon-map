# ADR-0011. Emission Factors

- Status: Accepted
- Date: 2026-05-26

## Context
전기·도시가스 사용량 → CO₂ 환산.

## Decision
**Source of Truth**:
- DB: `emission_factors` table (`source PK, factor, unit, reference, effective_from`)
- Code: `web/lib/emission-factors.ts` (DB 값과 동기, 빌드 시 검증)

**초기 값** (환경부/온실가스종합정보센터 공시):
- 전기: 0.4781 kgCO₂eq/kWh (2023 기준)
- 도시가스 (LNG): 2.176 kgCO₂eq/m³
- (수도, 지역난방은 데이터 없음 → 본 ADR 범위 밖)

## Alternatives
1. **IPCC 기본 계수** — 한국 발전 mix 반영 부족
2. **LCA 기반 ecoinvent** — 라이선스, 과잉
3. **시간대별 (한전 ESS)** — MVP 외

## Consequences
- 계수 변경 시 DB와 코드 한 곳만 수정
- 빌드 시 `web/scripts/check-factors.ts`로 일치성 강제
- 시점 추적: `effective_from`으로 과거 데이터 재계산 가능
