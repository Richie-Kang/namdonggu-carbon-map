# ADR-0006. SRID Policy

- Status: Accepted
- Date: 2026-05-26

## Context
원본 데이터 EPSG:5186 (Korea 2000 / 중부원점). 웹 표준 EPSG:4326. 면적 계산은 평면 좌표계 필요.

## Decision
- **Rest**: 모든 `geom`은 EPSG:4326 (WGS84 lon/lat)
- **Display**: MapLibre 내부 EPSG:3857 (Web Mercator), 자동 변환
- **Area calculation**: 함수 내에서 `ST_Transform(geom, 5186)` 후 `ST_Area`
- **Distance**: `ST_DistanceSphere` 또는 geography 캐스트

## Alternatives
1. EPSG:5186 그대로 저장 — 매번 변환, MapLibre는 3857만 표시
2. EPSG:5179 (통합원점) — 남동구는 중부원점이 적합

## Consequences
- 변환 시 정밀도 손실 < 1m (무시 가능)
- 코드 일관성↑, 디버깅 쉬움
- 면적·거리 계산 시 transform 강제
