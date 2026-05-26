# ADR-0015. Address Normalization

- Status: Accepted
- Date: 2026-05-26

## Context
주소 fallback 매칭 (전기/가스 ↔ 지번, 공장 ↔ 건물) 시 한글 주소 정규화 필요. "인천광역시 남동구 구월동 1234-5번지" 같은 표기 변동이 매칭 실패를 유발.

## Decision
**3단 매칭 전략**:
1. **PNU 19자리 직접 매칭** (1순위, 가장 정확)
2. **정규화된 지번주소 매칭** (2순위)
   - `normalize_address(s)`: 공백 정규화, "광역시"→"광역시" 동일, "번지"/"호" 제거, 본번-부번 분해
   - Python: `re` + `unicodedata.normalize('NFKC', s)`
3. **Kakao Local API geocoding** (3순위, 공장 좌표 생성)

## Library Choice
- 기본: 자체 `etl/utils.py:normalize_address()`
- 폴백: Kakao Local API (지오코딩)
- 시도: `juso-py` (국토부 도로명주소 OpenAPI, 일 5만 호출 무료)는 키 필요 → P2

## Cache Policy
- 정규화 결과는 stateless (캐시 불필요)
- Kakao 결과는 `etl/cache/geocoded.json` 캐싱 (재실행 시 호출 회피)

## Consequences
- 매칭율 측정 가능 (각 단계별 hit rate)
- 미매칭 주소는 `etl/reports/unmatched_addresses.csv` 별도 보관
- 키 미발급 시 1, 2단계만으로 운영
