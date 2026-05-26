# ADR-0003. Tile Format: PMTiles

- Status: Accepted
- Date: 2026-05-26

## Context
27k 건물 + 5.6k 격자 데이터를 효율적으로 스트리밍해야 함. 줌 레벨별 LOD가 필요. 정적 호스팅 가능해야 함 (tile server 운영 회피).

## Decision
`tippecanoe`로 PMTiles 생성 → Vercel `/public/tiles/buildings.pmtiles`, `grid.pmtiles`. CDN 캐싱. 파일명에 hash로 무효화.

## Alternatives
1. **MVT 서버 (martin/pg_tileserv)** — 운영 비용·복잡도↑
2. **GeoJSON 통째 로드** — 50–100MB 초기 전송, 메모리 부담
3. **TopoJSON** — 압축 좋으나 줌 LOD 부재
4. **Mapbox Tiles API** — 비용/공급사 lock-in

## Consequences
- HTTP Range 요청으로 한 파일에서 전 줌 서빙
- 무료 정적 호스팅 (Vercel CDN)
- 갱신 시 파일명 hash 변경 (cache-bust)
- PMTiles `>100MB` 시 GitHub LFS 또는 Supabase Storage 이동

## tippecanoe 옵션
```
tippecanoe -o buildings.pmtiles \
  --maximum-zoom=16 --minimum-zoom=10 \
  --drop-densest-as-needed \
  --layer=buildings \
  buildings.geojson
```
