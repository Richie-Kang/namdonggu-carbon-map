# ADR-0010. Monorepo Layout

- Status: Accepted
- Date: 2026-05-26

## Context
4개 코드베이스 (web/, etl/, ai/, harness/) + 1개 인프라 (supabase/) + 문서 (docs/).

## Decision
- 단일 GitHub repo
- 폴더 분리, 언어별 디펜던시 매니저 분리 (`web/pnpm-lock.yaml`, `etl/pyproject.toml`)
- pnpm workspace는 web 단일이라 미적용
- Python `etl/` + `ai/`는 동일 venv (`uv venv`)

## Alternatives
1. **Polyrepo** — 변경 동기화 부담
2. **pnpm workspace + python workspace (uv)** — 과잉
3. **nx/turborepo** — 빌드 캐시 이점은 있으나 작은 규모에 과잉

## Consequences
- PR 하나로 전 스택 변경 가능
- CI에서 affected paths 감지 (`paths:` filter)
- 향후 web/만 별도 패키지로 분리 가능
