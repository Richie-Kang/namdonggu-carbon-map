# ADR-0018. Security Hardening

- Status: Accepted
- Date: 2026-05-26

## Context
anon key 공개 + 무인증 공개 API → DoS·남용 위험. 기본 Supabase 설정은 충분하지 않을 수 있다.

## Decision

**1. PostgreSQL statement_timeout**
- 모든 RPC에 `SET LOCAL statement_timeout = '3s'`
- Anon role에 default `statement_timeout = '5s'`

**2. RLS read-only 강화**
- `parcels, buildings, energy_*, grid_*, businesses, factories, lookups` → SELECT만 허용
- 어떤 INSERT/UPDATE/DELETE 정책도 anon에 생성 금지
- `pg_*` 시스템 뷰 접근 차단 (revoke from anon)

**3. RPC 입력 validation**
- 모든 SQL function 인자에 정규식·범위 체크 (PL/pgSQL `RAISE EXCEPTION`)
- 예: `building_id ~ '^[A-Z0-9]{1,40}$'`, `bbox 좌표 범위`, `pop_delta_pct ∈ [-100, 200]`

**4. Edge Middleware Rate Limit**
- `web/middleware.ts`에 IP당 60 req/min (sliding window, Vercel KV 또는 Upstash)
- 429 응답 + `Retry-After` 헤더

**5. CORS Allow-list**
- `Access-Control-Allow-Origin`: `https://<vercel-domain>`, `http://localhost:3000`
- 그 외 차단

**6. CSP 헤더**
```
default-src 'self';
img-src 'self' data: https://*.tile.openstreetmap.org https://maplibre.org;
script-src 'self' 'unsafe-inline' 'unsafe-eval';   /* deck.gl 워커 */
connect-src 'self' https://*.supabase.co;
worker-src 'self' blob:;
```
조정 가능. CSP report-only 1주일 운영 후 enforce.

**7. HSTS**
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (Vercel 기본)
- preload 등록은 도메인 안정 후

**8. Secrets**
- `.env.local` git 제외 (이미 .gitignore)
- Service role key는 GitHub Actions secrets에만, 절대 Vercel preview env에는 노출 금지
- Sentry auth token은 빌드 시점에만 (`SENTRY_AUTH_TOKEN`)

**9. SQL Injection**
- raw SQL 금지. PostgREST + RPC만 사용
- 동적 SQL이 정말 필요할 때만 `format(%I)` quote-identifier

## Consequences
- 일부 응답 시간↑ (rate limit check ~5ms)
- middleware 추가 코드 ~50줄
- CSP 위반 시 외부 리소스 fetch 실패 → CSP report-only 단계 필수
