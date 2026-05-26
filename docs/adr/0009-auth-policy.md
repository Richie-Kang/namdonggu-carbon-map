# ADR-0009. Authentication Policy

- Status: Accepted
- Date: 2026-05-26

## Context
MVP는 공개 데이터(지번/건물/에너지/업종) + 인구 추정치 노출.

## Decision
- 인증 없음 (anonymous public)
- Supabase anon key 사용, RLS read-only
- 관리자/내부도구는 P3

## Alternatives
1. Supabase Auth 도입 — 데이터 공개 정책이라 불필요
2. IP allow-list — 외부 협력자 접근 불편

## Consequences
- anon key 노출됨 → RLS read-only로 영향 최소화
- 향후 인증 추가 시 Supabase Auth + JWT (마이그레이션 비파괴)
- DDoS 대응: Vercel Edge Middleware rate limit (60/min/IP)
- 데이터 개인정보: 격자 인구만 노출, 건물 인구는 ±10% 노이즈 옵션
