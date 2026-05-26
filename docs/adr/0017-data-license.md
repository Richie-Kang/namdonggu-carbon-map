# ADR-0017. Data License & Attribution

- Status: Accepted (사용자 약관 점검 권장)
- Date: 2026-05-26

## Context
공공·기관 제공 데이터를 공개 웹앱에서 재사용. 라이선스 준수 필수.

## Decision
**저장소 LICENSE**: MIT (코드).

**데이터 출처 표시 (README + 앱 푸터)**:
- 연속지적도, GIS건물통합정보, 건축물대장 — **국토교통부 V-World** (공공누리 1유형 — 출처표시)
- 상가(상권)정보 — **소상공인시장진흥공단** (공공누리 1유형)
- 공장등록현황 — **인천광역시 남동구** (공공누리 1유형)
- 전기·가스 사용량 — **한국전력공사, 한국가스공사** (공공누리 1유형 가정, 약관 점검 필요)
- 격자 인구 — **통계청 SGIS Open API** (출처표시 의무)
- 도시계획 — **인천광역시** (공공누리 1유형)

**약관 점검 책임**: 사용자(요청자)가 데이터 제공기관에 재배포 동의 확인. 그 전까지는 "research preview" 라벨 유지.

## Implementation
- `web/components/Footer.tsx`에 출처 명시
- `LICENSE` 파일에 코드 라이선스(MIT) + 데이터 attribution
- 상호명 등 식별 가능 정보 제3자 노출 시 추가 약관 점검 (P1)

## Consequences
- 출처 누락 시 라이선스 위반 → 사이트 down 가능
- "research preview" 라벨로 약관 점검 전 위험 감소
