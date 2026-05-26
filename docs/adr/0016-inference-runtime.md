# ADR-0016. AI Inference Runtime (Supersedes ADR-0005)

- Status: Accepted
- Date: 2026-05-26
- Supersedes: ADR-0005 (Edge ONNX 옵션 폐기)

## Context
ADR-0005에서 Vercel Edge Function + onnxruntime-web 가정. 실제 Edge runtime은 **압축 1MB / unzipped 4MB 코드 한계**라 `onnxruntime-web` (~10MB WASM 포함) 사용 불가. 재정의 필요.

## Decision
**1순위: Node Serverless Function**
- `web/app/api/predict/route.ts` 에서 `export const runtime = 'nodejs'`
- `onnxruntime-node` 사용
- 모델 파일은 `web/public/models/population.onnx` (정적, ~3–8MB 예상)
- 함수 한도: 압축 250MB / unzipped 50MB (충분)
- 콜드스타트 ~1–2s, warm-up은 `/api/health`에서 모델 사전 로드

**2순위: 클라이언트 추론 (fallback)**
- Node serverless 콜드스타트가 800ms 한도 초과 지속 시 전환
- 클라이언트에서 `onnxruntime-web` 동적 import (코드분할)
- 모델은 정적 fetch + IndexedDB 캐시
- 트레이드오프: 모델 노출(IP 위험은 낮음 — 학습 데이터가 공개)

**Edge runtime은 폐기**: 코드 한계 미충족.

## Performance Target
- p95 ≤ 800ms (콜드 제외 ≤ 200ms)
- 콜드스타트 시 사용자에게 스피너

## Fallback Chain
1. `onnxruntime-node` 실패 → 룰베이스 추정 (`use_code별 평균 인구 × area_total`)
2. 모델 로드 실패 → 503 + warning `"model_unavailable_rule_based_used"`

## Consequences
- Hobby plan 함수 cold start 다소 느림 (확인 후 Pro 고려)
- 모델 버전은 파일명에 hash (`population.v0.1.0.<sha>.onnx`)
