# ADR-0013. PMTiles Hosting Location

- Status: Pending (build 후 측정 → Accept)
- Date: 2026-05-26

## Context
PMTiles 파일 50–150MB 예상. 정적 호스팅 위치 결정 필요.

## Decision
**우선순위**:
1. 50MB 이내 → `web/public/tiles/*.pmtiles` (Vercel /public, CDN)
2. 50–100MB → Vercel /public + Git LFS
3. ≥ 100MB 또는 자주 갱신 → Supabase Storage public bucket (CDN)

빌드 시 `scripts/check-tile-size.sh`로 결정 자동화.

## Alternatives
1. Cloudflare R2 — 가능하나 의존성 추가
2. S3 — 비용·셋업
3. Github Releases — CDN 약함

## Consequences
- 사이즈 변동 추적, `.env`의 `NEXT_PUBLIC_PMTILES_URL`로 분기
- Storage 사용 시 1회 업로드 스크립트 작성 (`scripts/upload-tiles.sh`)
