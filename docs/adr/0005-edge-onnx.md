# ADR-0005. AI Inference: Vercel Edge Function + ONNX

- Status: Accepted (콜드스타트 측정 후 재검토)
- Date: 2026-05-26

## Context
시뮬레이터 응답 ≤800ms 목표. 모델 ~5–10MB. 동시성 처리·낮은 지연 필요.

## Decision
- Runtime: Vercel Edge Function (`export const runtime = 'edge'`)
- Inference: `onnxruntime-web` (WASM backend)
- 모델 캐싱: 모듈 스코프에서 첫 호출 시 로드, 이후 재사용

## Alternatives
1. **브라우저 추론** — 모델 노출(IP), 초기 다운로드 비용
2. **Supabase Edge Functions (Deno)** — ONNX 지원 미흡
3. **별도 Python API (FastAPI / Railway)** — 추가 호스팅, 콜드스타트↑
4. **Vercel Serverless Functions (Node)** — 50MB 함수 한계, 모델 + deps 우려

## Consequences
- 콜드 스타트 ~500ms 추가 가능 → warm-up ping(`/api/health`로 모듈 로드)
- Edge runtime은 fs/native deps 제한, WASM ONNX runtime 사용
- 모델 파일은 `web/public/models/population.onnx`로 정적 fetch
- 모델 메타(version, factor_table)는 코드 import

## Fallback
- Edge ONNX 추론 실패 시 → 룰베이스 추정 (use_code별 평균 인구 × area_total)
- `warnings: ["model_unavailable, used_rule_based"]` 반환
