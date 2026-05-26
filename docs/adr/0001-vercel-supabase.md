# ADR-0001. Backend: Vercel + Supabase

- Status: Accepted
- Date: 2026-05-26
- Deciders: Richard Kang

## Context
원본 데이터 1.1GB. 사용자가 Vercel 선호. Vercel 단독은 함수 50MB 페이로드 한계로 1.1GB 처리 불가능.

## Decision
- 프론트엔드/API: Vercel (Next.js 14 App Router)
- 데이터: Supabase (PostgreSQL 15 + PostGIS 3.4) — 무료 티어 500MB DB / 1GB 파일

## Alternatives
1. Vercel + Cloudflare D1 — PostGIS 부재, 공간연산 어려움
2. Railway 단독 — GIS 가능하나 정적 호스팅·Edge 약함
3. AWS RDS + S3 + CloudFront — 비용↑, 운영 부담↑
4. PlanetScale + Vercel — PostGIS 미지원

## Consequences
- 외부 의존성 +1 (Supabase)
- DB 500MB 한도 모니터링 필요 (목표 ≤400MB)
- PostGIS 공간 함수 풀 활용 가능
- RLS로 anon read-only 안전
- 무료 티어 동시 conn 50, 휴면 시 일시 hibernate (콜드 스타트 ~수초)

## Compliance
- 빌드 전 `SELECT pg_database_size(current_database())` 체크
- 한도 초과 시 사용자 알림 + 컬럼 제거/타일링 강화
