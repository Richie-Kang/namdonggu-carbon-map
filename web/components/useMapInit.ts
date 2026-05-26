'use client';

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import maplibregl, { type Map as MlMap, type Marker as MlMarker } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { useAppStore } from '@/store';

const NAMDONG_CENTER: [number, number] = [126.7396, 37.4459];
const INITIAL_ZOOM = 12;
const BUILDING_MIN_ZOOM = 14;
const NAMDONG_SIGUNGU_CODE = '2820000000';
// reason: Vercel env was registered as an empty string in prod which knocked
// out every PMTiles layer. PMTiles ship in /public/tiles, so the same-origin
// path is the right default whenever the env is blank.
const PMTILES_URL = process.env.NEXT_PUBLIC_PMTILES_URL || '/tiles';

// CartoDB Voyager raster — same OSM data underneath, but served from a CDN
// that doesn't refuse vercel-hosted referrers the way tile.openstreetmap.org
// has been silently doing in production (Image #6).  Style mirrors DPM_project
// reference (Image #7): roads, terrain, Korean labels burned in.
const DEFAULT_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    basemap: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    // Light grey backdrop while basemap tiles stream in (Tailwind slate-100)
    { id: 'bg', type: 'background', paint: { 'background-color': '#f1f5f9' } },
    { id: 'basemap', type: 'raster', source: 'basemap', paint: { 'raster-opacity': 1 } },
  ],
};

// reason: the env-or-default pattern was getting dead-code-eliminated in
// production builds (DEFAULT_STYLE silently stripped, MAP_STYLE collapsed
// to ''). Bind to the literal so webpack must keep it.
const MAP_STYLE: string | maplibregl.StyleSpecification = DEFAULT_STYLE;

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

  // Boundary outline — 남동구 시군구 폴리곤만. 전국 + 인접구 + 동을 모두
  // 그리면 가독성이 떨어진다는 사용자 피드백 반영.
  map.addLayer({
    id: 'boundary-line',
    type: 'line',
    source: 'boundary-pmtiles',
    'source-layer': 'boundary',
    filter: [
      'all',
      ['==', ['get', 'level'], 'sigungu'],
      ['==', ['get', 'code'], NAMDONG_SIGUNGU_CODE],
    ],
    paint: { 'line-color': '#dc2626', 'line-width': 2.4, 'line-opacity': 0.85 },
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
    paint: { 'fill-color': QUINTILE_COLOR, 'fill-opacity': 0.65 },
  });
  map.addLayer({
    id: 'grid-fill',
    type: 'fill',
    source: 'grid-pmtiles',
    'source-layer': 'grid',
    // reason: only paint cells that actually have CO2 — null quintile cells
    // covered the basemap with a translucent grey blanket.
    filter: ['has', 'co2_quintile'],
    maxzoom: BUILDING_MIN_ZOOM,
    paint: { 'fill-color': QUINTILE_COLOR, 'fill-opacity': 0.35 },
  });
}

function bindClicks(
  map: MlMap,
  setSelected: ReturnType<typeof useAppStore.getState>['setSelected'],
  setGridFocus: (gridId: string | null) => void,
  setPin: (lon: number, lat: number) => void,
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
    setPin(ev.lngLat.lng, ev.lngLat.lat);
    setGridFocus(null);
  });
  map.on('click', 'grid-fill', (ev) => {
    const f = ev.features?.[0];
    if (!f) return;
    const grid = f.properties?.grid_id ? String(f.properties.grid_id) : null;
    // reason: close any open building panel so the grid card isn't hidden
    // behind it; also clear the marker pin.
    setSelected(null);
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
  setPin: (lon: number, lat: number) => void;
  clearPin: () => void;
};

export function useMapInit(
  setSelected: ReturnType<typeof useAppStore.getState>['setSelected'],
): UseMapInitResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerRef = useRef<MlMarker | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [gridFocus, setGridFocus] = useState<string | null>(null);

  const clearPin = useCallback(() => {
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }, []);

  const setPin = useCallback((lon: number, lat: number) => {
    const m = mapRef.current;
    if (!m) return;
    if (markerRef.current) {
      markerRef.current.setLngLat([lon, lat]);
      return;
    }
    markerRef.current = new maplibregl.Marker({ color: '#dc2626' })
      .setLngLat([lon, lat])
      .addTo(m);
  }, []);

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
        bindClicks(map, setSelected, setGridFocus, (lon, lat) => {
          const cur = markerRef.current;
          if (cur) {
            cur.setLngLat([lon, lat]);
          } else {
            markerRef.current = new maplibregl.Marker({ color: '#dc2626' })
              .setLngLat([lon, lat])
              .addTo(map);
          }
        });
        const state = useAppStore.getState();
        applyVisibility(map, state.showBuildings, state.showGrid, state.showBoundary, state.showRoads);
      }
      setReady(true);
    });
    map.on('zoom', () => setZoom(map.getZoom()));
    return () => {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      map.remove();
      mapRef.current = null;
      maplibregl.removeProtocol('pmtiles');
    };
  }, [setSelected]);

  return { containerRef, mapRef, ready, zoom, gridFocus, setGridFocus, setPin, clearPin };
}
