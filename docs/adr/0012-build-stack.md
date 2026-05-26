# ADR-0012. Build Tools & Runtime

- Status: Accepted
- Date: 2026-05-26

## Context
풀스택. Web + Python ETL + Python AI.

## Decision
- **Web**: Next.js 14 App Router, TypeScript strict, pnpm, Node 20, Tailwind v3, shadcn/ui, Vitest, Playwright
- **Python**: 3.11, uv (또는 poetry), GeoPandas, Shapely, psycopg[binary], xgboost, scikit-learn, onnxmltools
- **Geo CLI**: tippecanoe (Homebrew), ogr2ogr (GDAL)
- **CI**: GitHub Actions

## Alternatives
1. Next.js 15 — 신버전, 일부 라이브러리 호환 불확실
2. Bun — 일부 ESM/CJS 호환성 이슈
3. Pants/Bazel — 과잉

## Consequences
- 표준 도구로 학습/유지 부담↓
- `pnpm` 단일 락 파일, dedupe 우수
- uv는 빠른 install (10×)
