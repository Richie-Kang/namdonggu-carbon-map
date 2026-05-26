# ADR-0008. Geocoding (Factory Data)

- Status: Pending (API 키 발급 후 Accept)
- Date: 2026-05-26

## Context
파일 6 `남동산단 입주기업 공장등록현황`에 위경도가 없음. 주소 컬럼만 존재 (8,303행).

## Decision (제안)
1. 1차: Kakao Local API (REST) 주소 검색 → coords
2. 2차 (Kakao 실패 시): VWorld 지오코딩 API
3. 모두 실패 시: NULL + flag `geocoded=false`, 분리 csv `etl/reports/geocoding_failures.csv` 보관
4. 결과는 캐시(`etl/cache/geocoded.json`)로 재실행 시 호출 회피

## Alternatives
1. **OpenStreetMap Nominatim** — rate limit 1req/sec, 한국 주소 정확도↓
2. **Google Maps API** — 비용↑
3. **수동 매핑** — 8.3k건 비현실
4. **주소→PNU 매칭 (행정안전부 도로명주소 DB)** — 가능하나 셋업 부담

## Consequences
- Kakao Free Tier: 일 100k 호출 (충분)
- 매칭율 90%+ 기대. 미매칭은 패널에서 "위치 미상"
- 키 발급은 사용자 작업 (사용자 확인 필요)

## Fallback
- Geocoding 키 미발급 시 → 공장 데이터 좌표 NULL. 패널은 주소 텍스트만 표시. 격자 hotspot 합산에서 제외 (또는 지번 매칭 시도)
