'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { useAppStore } from '@/store';
import { BuildingPanel } from './BuildingPanel';
import { SimulatorPanel } from './SimulatorPanel';
import { Legend } from './Legend';
import { TopBar } from './TopBar';

const NAMDONG_CENTER: [number, number] = [126.7396, 37.4459];
const INITIAL_ZOOM = 12;
const BUILDING_MIN_ZOOM = 14;

const MAP_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? 'https://demotiles.maplibre.org/style.json';
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

function addLayers(map: MlMap) {
  map.addSource('buildings-pmtiles', {
    type: 'vector',
    url: `pmtiles://${PMTILES_URL}/buildings.pmtiles`,
  });
  map.addSource('grid-pmtiles', {
    type: 'vector',
    url: `pmtiles://${PMTILES_URL}/grid.pmtiles`,
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
    paint: { 'fill-color': QUINTILE_COLOR, 'fill-opacity': 0.55 },
  });
}

function bindClicks(
  map: MlMap,
  setSelected: ReturnType<typeof useAppStore.getState>['setSelected'],
  setGridFocus: (gridId: string | null) => void
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

function applyVisibility(map: MlMap, showBuildings: boolean, showGrid: boolean) {
  if (map.getLayer('buildings-fill')) {
    map.setLayoutProperty('buildings-fill', 'visibility', showBuildings ? 'visible' : 'none');
  }
  if (map.getLayer('grid-fill')) {
    map.setLayoutProperty('grid-fill', 'visibility', showGrid ? 'visible' : 'none');
  }
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [gridFocus, setGridFocus] = useState<string | null>(null);
  const setSelected = useAppStore((s) => s.setSelected);
  // reason: subscribe to layer flags only for the visibility-apply effect below
  const showBuildings = useAppStore((s) => s.showBuildings);
  const showGrid = useAppStore((s) => s.showGrid);

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
        // reason: read current store flags (closure-safe) for initial visibility
        const state = useAppStore.getState();
        applyVisibility(map, state.showBuildings, state.showGrid);
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

  useEffect(() => {
    if (mapRef.current && ready) applyVisibility(mapRef.current, showBuildings, showGrid);
  }, [showBuildings, showGrid, ready]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-50/50 text-slate-700">
          지도 로드 중…
        </div>
      )}
      <TopBar />
      <Legend zoom={zoom} buildingMinZoom={BUILDING_MIN_ZOOM} />
      <BuildingPanel />
      <SimulatorPanel />
      <GridFocusList gridId={gridFocus} onClose={() => setGridFocus(null)} />
      {!PMTILES_URL && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-900 shadow">
          <code>NEXT_PUBLIC_PMTILES_URL</code> 미설정 — ETL 07 실행 후 .env에 추가
        </div>
      )}
    </div>
  );
}

function GridFocusList({ gridId, onClose }: { gridId: string | null; onClose: () => void }) {
  const setSelected = useAppStore((s) => s.setSelected);
  const [rows, setRows] = useState<{ building_id: string; name: string | null; co2_kg_month: number | null }[] | null>(null);
  useEffect(() => {
    if (!gridId) { setRows(null); return; }
    let cancelled = false;
    fetch(`/api/grid/top?grid_id=${encodeURIComponent(gridId)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then((data) => { if (!cancelled) setRows(data.rows ?? []); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [gridId]);
  if (!gridId) return null;
  return (
    <aside className="absolute right-4 top-4 z-10 w-[280px] rounded-lg bg-white/97 p-3 shadow-lg text-sm">
      <div className="flex items-center justify-between">
        <div className="font-semibold">격자 {gridId}</div>
        <button onClick={onClose} className="text-xs text-slate-500" aria-label="닫기">✕</button>
      </div>
      <p className="text-[10px] text-slate-500">상위 5 배출 건물</p>
      <ul className="mt-2 space-y-1">
        {(rows ?? []).map((r) => (
          <li key={r.building_id}>
            <button
              className="text-left w-full hover:bg-slate-50 rounded px-1 py-0.5"
              onClick={() => setSelected({ building_id: r.building_id, name: r.name })}
            >
              <div className="text-sm">{r.name ?? r.building_id}</div>
              <div className="text-[10px] text-slate-500">
                {(r.co2_kg_month ?? 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 })} kg/월
              </div>
            </button>
          </li>
        ))}
        {rows && rows.length === 0 && <li className="text-xs text-slate-500">데이터 없음</li>}
      </ul>
    </aside>
  );
}
