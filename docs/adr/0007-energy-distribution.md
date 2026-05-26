# ADR-0007. 지번→건물 에너지 안분

- Status: Accepted (주용도 가중치는 후속 ADR로 개선 여지)
- Date: 2026-05-26

## Context
원본 전기/가스 데이터는 **지번(PNU) + 월** 단위. 한 지번에 건물이 여러 개일 수 있음. 시각화·시뮬레이션은 **건물 단위** 필요.

## Decision
- 기본: 연면적(`area_total`) 비율 안분
  - `share_j = area_total_j / Σ area_total_in_pnu`
  - `electricity_j = share_j × electricity_pnu`
- 지번 내 건물 1개 → 그대로 전달
- 안분 결과에 `source='proportional'` flag 기록
- 합계 정합성: `harness/eval_etl.py`에서 `Σbuilding_energy ≈ Σenergy_monthly` (rel err ≤ 0.01%)

## Alternatives
1. **균등 분배** — 단순하나 1층 창고 vs 20층 아파트 동일 취급, 비현실
2. **건축면적 비율** — 층수 무시
3. **추정 인구 비율** — AI 모델 의존(순환참조)
4. **주용도별 가중** — 더 정확하나 가중치 결정 추가 ADR 필요

## Consequences
- 주거+상가 혼재 건물 우점 시 부정확
- 시뮬레이션 정확도 한계 명시
- 후속 가중치 도입은 ADR-007b로 확장

## Future
- 주용도별 단위면적 에너지 강도(전국 표준) 가중 도입 검토
- 측정 가능 시 실측 라벨로 회귀 보정
