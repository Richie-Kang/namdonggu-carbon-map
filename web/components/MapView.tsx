'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { GeoJsonLayer } from '@deck.gl/layers';
import { useAppStore } from '@/store';
import { quintileRGBA } from '@/lib/colors';
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

export default function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const setSelected = useAppStore((s) => s.setSelected);
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
          paint: {
            'fill-color': [
              'case',
              ['==', ['get', 'co2_quintile'], 1], '#16a34a',
              ['==', ['get', 'co2_quintile'], 2], '#84cc16',
              ['==', ['get', 'co2_quintile'], 3], '#eab308',
              ['==', ['get', 'co2_quintile'], 4], '#f97316',
              ['==', ['get', 'co2_quintile'], 5], '#dc2626',
              '#9ca3af',
            ],
            'fill-opacity': 0.78,
          },
        });
        map.addLayer({
          id: 'grid-fill',
          type: 'fill',
          source: 'grid-pmtiles',
          'source-layer': 'grid',
          maxzoom: BUILDING_MIN_ZOOM,
          paint: {
            'fill-color': [
              'case',
              ['==', ['get', 'co2_quintile'], 1], '#16a34a',
              ['==', ['get', 'co2_quintile'], 2], '#84cc16',
              ['==', ['get', 'co2_quintile'], 3], '#eab308',
              ['==', ['get', 'co2_quintile'], 4], '#f97316',
              ['==', ['get', 'co2_quintile'], 5], '#dc2626',
              'rgba(156,163,175,0.25)',
            ],
            'fill-opacity': 0.55,
          },
        });

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
        });
        map.on('mouseenter', 'buildings-fill', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'buildings-fill', () => {
          map.getCanvas().style.cursor = '';
        });
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
      {!PMTILES_URL && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-900 shadow">
          <code>NEXT_PUBLIC_PMTILES_URL</code> 미설정 — ETL 07 실행 후 .env에 추가
        </div>
      )}
    </div>
  );
}
