# CLAUDE.md — namdonggu-carbon-map

> This codebase is small and load-bearing. Read everything before changing anything.
> Inspired by Andrej Karpathy's nanoGPT philosophy: minimal, sharp, and honest about what it does.

## North Star
Build a building-level carbon map of **인천 남동구 (Namdong-gu, Incheon)**.
Every change should make the map more accurate, faster, or easier to understand. No other goals.

## Hard rules
- **No speculative abstractions.** One file, one job. Three similar lines beats a premature abstraction.
- **Numbers are constants, not literals.** Emission factors, thresholds, color stops — all live in `web/lib/*` or `etl/utils.py`. Never inline.
- **Every ETL step writes a snapshot.** `{run_at, counts, match_rate, warnings}` → `etl/reports/<step>_<ts>.json`.
- **Every feature ships with a harness check.** No harness, no merge.
- **PNU is the spine.** If something joins by anything else (address, name, lat/lng), justify it inline with a comment that starts `# reason:`.
- **Coordinates are EPSG:4326 at rest.** Convert at boundaries only (file load, area calc).
- **No silent failures.** Fail fast, log structured JSON, attach context (`pnu`, `building_id`, `step`).
- **No mocked DB in integration tests.** Use a Supabase test schema.

## Workflow per change
1. Read the relevant README/section/ADR.
2. Reproduce the bug or the metric with a tiny script (`scripts/repro_*.py` or `.ts`).
3. Change code. Re-run the harness. Diff the snapshot.
4. Open PR with: what changed, snapshot delta, screenshot, harness output.

## Style
- TypeScript strict. No `any` unless paired with `// reason: <why>`.
- Python type hints required. `mypy --strict` clean.
- Functions ≤ 40 lines. If longer, split or justify with `# reason:` comment.
- No comments that restate the code. Comments explain *why*, not *what*.
- Korean is allowed in UI strings and column-display names; code identifiers stay English.

## Performance budgets (enforced by harness)
- `/api/aggregate` p95 ≤ 300ms
- `/api/predict` p95 ≤ 800ms
- Map FPS ≥ 30 at zoom 14
- Next.js build ≤ 5 min
- Supabase DB ≤ 400MB (free-tier cap is 500MB)
- Initial JS bundle ≤ 350KB gzipped
- LCP ≤ 2.5s on simulated 4G

## Data invariants
- `parcels.count == 43_295` (±0.1% allowed for cleaned-up duplicates)
- `buildings.count == 27_188` (±0.1%)
- `energy_monthly`: PNU match rate ≥ 90%
- `building_energy`: ETL-side sum ≈ `energy_monthly` sum (relative error ≤ 0.01%)
- `grid_100m`: cell count ∈ [5_000, 6_500]
- `grid_500m_pop`: cell count > 0 (SGIS API)
- All `geom` columns have SRID 4326

## Forbidden
- Mocking the DB in integration tests.
- Adding npm/pip packages without an ADR entry.
- Touching unrelated code while fixing something else.
- Removing or weakening RLS policies.
- Inlining emission factors or color stops.
- Commits that don't run the relevant harness locally.
- Pushing to `main` directly. Use PR + CI checks.

## File layout (authoritative)
```
namdonggu-carbon-map/
├── CLAUDE.md, README.md, .env.example, .gitignore
├── docs/PRD.md, ARCHITECTURE.md, adr/000X-*.md
├── harness/           ← eval_etl.py, eval_ai.py, smoke_e2e.ts
├── etl/               ← 01_…py … 07_export_pmtiles.sh, utils.py
├── ai/                ← features.py, train.py, convert_onnx.py, models/
├── web/               ← Next.js 14 app
├── supabase/migrations/ ← 0001_init.sql, 0002_indices.sql, 0003_rpc.sql, 0004_rls.sql
└── .github/workflows/ ← ci.yml, deploy.yml
```

## Truths about this project
- It is a **MVP for one city district**. Don't engineer for a thousand.
- The AI label is **pseudo** (population dasymetrically distributed from 500m grids).
  Report uncertainty everywhere a number is shown.
- We do **not** have water or district-heating data. Don't fake it.
- We do **not** have measured per-building CO₂ ground truth. Don't claim accuracy we can't prove.

## When you (Claude) are confused
- Stop. Re-read this file and the relevant ADR.
- If still confused, ask the human one specific question (cite the file/line).
- Never invent data, factors, schemas, or APIs.
