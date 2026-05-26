# ADR-0002. Map: MapLibre GL JS + deck.gl

- Status: Accepted
- Date: 2026-05-26

## Context
27,188 건물 폴리곤 + 5,000~6,500개 격자를 렌더링. 컬러 인터폴레이션, 클릭 hit-testing, 빠른 줌·팬 필요.

## Decision
- 베이스맵: MapLibre GL JS (OSS, OSM style)
- 데이터 레이어: deck.gl GeoJsonLayer / SolidPolygonLayer / GridLayer

## Alternatives
1. **Mapbox GL JS** — 라이선스 비용, 사용량 제한 (50k tile loads/mo 무료)
2. **Leaflet** — WebGL 부재. 27k 폴리곤 SVG 렌더 시 fps↓ 심각
3. **Kepler.gl** — 앱 통째 임베드. 무거움
4. **CesiumJS** — 3D 과잉. 데이터 형태 mismatch
5. **OpenLayers** — 가능하나 deck.gl 통합 약함
6. **react-map-gl + Mapbox** — 라이선스 동일

## Consequences
- Mapbox API key 불필요, OSS
- deck.gl과 자연스러운 layered 렌더
- 추후 deck.gl 3D 확장 (extrusion으로 건물 높이 시각화) 가능
- WebGL2 필요, IE 미지원 (이미 OOS)
