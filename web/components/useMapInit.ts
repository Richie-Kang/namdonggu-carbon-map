'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { useAppStore } from '@/store';

const NAMDONG_CENTER: [number, number] = [126.7396, 37.4459];
const INITIAL_ZOOM = 12;
const BUILDING_MIN_ZOOM = 14;
// reason: demotiles has no Korean labels. CARTO Voyager (free tier, OSM-based)
// gives Korean street and POI labels out of the box.
const DEFAULT_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_STYLE;
const PMTILES_URL = process.env.NEXT_PUBLIC_PMTILES_URL ?? '';

const QUINTILE_COLOR = [
  'case',
  ['==', ['get', 'co2_quintile'], 1], '#16a34a',
  ['==', ['get', 'co2_quintile'], 2], '#84cc16',
  ['==', ['get', 'co2_quintile'], 3], '#eab308',
  ['==', ['get', 'co2_quintile'], 4], '#f97316',
  ['==', ['get', 'co2_quintile'], 5], '#dc2626',
  '#9ca3af',
] as unknown as maplibregl.ExpressionSpecification;

export const MAP_CONST = { INITIAL_ZOOM, BUILDING_MIN_ZOOM, PMTILES_URL };

function addLayers(map: MlMap) {
  map.addSource('buildings-pmtiles', {
    type: 'vector',
    url: `pmtiles://${PMTILES_URL}/buildings.pmtiles`,
  });
  map.addSource('grid-pmtiles', {
    type: 'vector',
    url: `pmtiles://${PMTILES_URL}/grid.pmtiles`,
  });

  // Optional overlays. Sources are added defensively — the tiles file may not
  // exist yet during early dev cycles.
  map.addSource('boundary-pmtiles', {
    type: 'vector',
    url: `pmtiles://${PMTILES_URL}/boundary.pmtiles`,
  });
  map.addSource('roads-pmtiles', {
    type: 'vector',
    url: `pmtiles://${PMTILES_URL}/roads.pmtiles`,
  });

  // Boundary outline (남동구 emphasis)
  map.addLayer({
    id: 'boundary-line',
    type: 'line',
    source: 'boundary-pmtiles',
    'source-layer': 'boundary',
    paint: { 'line-color': '#0f172a', 'line-width': 1.8, 'line-opacity': 0.55 },
  });

  // Roads layer (light grey)
  map.addLayer({
    id: 'roads-line',
    type: 'line',
    source: 'roads-pmtiles',
    'source-layer': 'roads',
    paint: { 'line-color': '#475569', 'line-width': 0.7, 'line-opacity': 0.35 },
  });

  map.addLayer({
    id: 'buildings-fill',
    type: 'fill',
    source: 'buildings-pmtiles',
    'source-layer': 'buildings',
    minzoom: BUILDING_MIN_ZOOM,
    paint: { 'fill-color': QUINTILE_COLOR, 'fill-opacity': 0.78 },
  });
  map.addLayer({
    id: 'grid-fill',
    type: 'fill',
    source: 'grid-pmtiles',
    'source-layer': 'grid',
    maxzoom: BUILDING_MIN_ZOOM,
    paint: { 'fill-color': QUINTILE_COLOR, 'fill-opacity': 0.45 },
  });
}

function bindClicks(
  map: MlMap,
  setSelected: ReturnType<typeof useAppStore.getState>['setSelected'],
  setGridFocus: (gridId: string | null) => void,
) {
  map.on('click', 'buildings-fill', (ev) => {
    const f = ev.features?.[0];
    if (!f) return;
    const p = f.properties ?? {};
    setSelected({
      building_id: String(p.building_id),
      pnu: p.pnu ?? null,
      name: p.name ?? null,
      use_main: p.use_main ?? null,
      co2_kg_month: typeof p.co2_kg_month === 'number' ? p.co2_kg_month : null,
      co2_quintile: typeof p.co2_quintile === 'number' ? p.co2_quintile : null,
    });
    setGridFocus(null);
  });
  map.on('click', 'grid-fill', (ev) => {
    const f = ev.features?.[0];
    if (!f) return;
    const grid = f.properties?.grid_id ? String(f.properties.grid_id) : null;
    setGridFocus(grid);
  });
  for (const layer of ['buildings-fill', 'grid-fill'] as const) {
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
  }
}

export function applyVisibility(
  map: MlMap,
  showBuildings: boolean,
  showGrid: boolean,
  showBoundary: boolean,
  showRoads: boolean,
) {
  const set = (id: string, on: boolean) => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    }
  };
  set('buildings-fill', showBuildings);
  set('grid-fill', showGrid);
  set('boundary-line', showBoundary);
  set('roads-line', showRoads);
}

type UseMapInitResult = {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  mapRef: MutableRefObject<MlMap | null>;
  ready: boolean;
  zoom: number;
  gridFocus: string | null;
  setGridFocus: (g: string | null) => void;
};

export function useMapInit(
  setSelected: ReturnType<typeof useAppStore.getState>['setSelected'],
): UseMapInitResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [gridFocus, setGridFocus] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: NAMDONG_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: 9,
      maxZoom: 18,
    });
    mapRef.current = map;
    map.on('load', () => {
      if (PMTILES_URL) {
        addLayers(map);
        bindClicks(map, setSelected, setGridFocus);
        const state = useAppStore.getState();
        applyVisibility(map, state.showBuildings, state.showGrid, state.showBoundary, state.showRoads);
      }
      setReady(true);
    });
    map.on('zoom', () => setZoom(map.getZoom()));
    return () => {
      map.remove();
      mapRef.current = null;
      maplibregl.removeProtocol('pmtiles');
    };
  }, [setSelected]);

  return { containerRef, mapRef, ready, zoom, gridFocus, setGridFocus };
}
