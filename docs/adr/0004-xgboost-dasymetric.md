# ADR-0004. AI Model: XGBoost Dasymetric

- Status: Accepted
- Date: 2026-05-26

## Context
SGIS 500m 격자 인구를 건물 단위로 disaggregation. 데이터셋 작음 (~수천 격자, 27k 건물). 빠른 학습/추론·해석 가능성·Edge 추론 필요.

## Decision
- 모델: XGBoost Regressor (`reg:squarederror`)
- 하이퍼: `max_depth=6, eta=0.05, n_estimators=500, early_stopping=20`
- 라벨: 의사라벨 (격자 인구 × 연면적 비율 × residential_weight)
- 학습: 5-fold spatial CV (격자 centroid KMeans fold)
- 제약: 학습 후 격자 합계 보정 (`pred_j ← pred_j × P_g / Σpred`)
- 평가: MAE/RMSE/R²/격자합계 위반율

## Alternatives
1. **Linear regression** — 표현력 부족, 비선형 무시
2. **LightGBM** — 유사 성능, XGBoost ONNX 변환 성숙도가 약간 높음
3. **GNN** — 데이터셋 부족, 복잡도↑
4. **CNN + 위성** — 원격탐사 데이터 미제공, 본 단계 외
5. **Random forest** — 추론 느림, ONNX 크기↑

## Consequences
- ONNX 변환 가능 → Vercel Edge 추론
- SHAP으로 해석 가능
- 의사라벨 약함 → 결과는 추정치라고 명시
- 추후 실측 라벨 확보 시 재학습 워크플로 동일하게 사용

## Evaluation Gates (eval_ai.py)
- R² ≥ 0.4
- 격자합계 제약 위반율 ≤ 15%
- 주거/비주거 그룹별 MAE 보고
- 미달 시 `sys.exit(1)`
