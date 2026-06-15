'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store';
import { useMapInit, applyVisibility, applyTheme, MAP_CONST } from './useMapInit';
import { BuildingPanel } from './BuildingPanel';
import { Legend } from './Legend';
import { TopBar } from './TopBar';
import { GridFocusList } from './GridFocusList';

export default function MapView() {
  const setSelected = useAppStore((s) => s.setSelected);
  const selected = useAppStore((s) => s.selected);
  const showBuildings = useAppStore((s) => s.showBuildings);
  const showGrid = useAppStore((s) => s.showGrid);
  const showBoundary = useAppStore((s) => s.showBoundary);
  const showRoads = useAppStore((s) => s.showRoads);
  const themeMode = useAppStore((s) => s.themeMode);
  const industryFilter = useAppStore((s) => s.industryFilter);
  const { containerRef, mapRef, ready, zoom, gridFocus, setGridFocus, setPin, clearPin } =
    useMapInit(setSelected);

  useEffect(() => {
    if (mapRef.current && ready) {
      applyVisibility(mapRef.current, showBuildings, showGrid, showBoundary, showRoads);
    }
  }, [showBuildings, showGrid, showBoundary, showRoads, ready, mapRef]);

  useEffect(() => {
    if (mapRef.current && ready) {
      applyTheme(mapRef.current, themeMode, industryFilter);
    }
  }, [themeMode, industryFilter, ready, mapRef]);

  // reason: drop the pin when the user clears their selection from the panel.
  useEffect(() => {
    if (!selected) clearPin();
  }, [selected, clearPin]);

  function flyTo(lon: number, lat: number) {
    const m = mapRef.current;
    if (!m) return;
    m.flyTo({ center: [lon, lat], zoom: 17, essential: true });
    setPin(lon, lat);
  }

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>
      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-50/50 text-slate-700">
          지도 로드 중…
        </div>
      )}
      <TopBar onFly={flyTo} />
      <div className="absolute bottom-4 left-4 z-10 flex items-end gap-3">
        <Legend zoom={zoom} buildingMinZoom={MAP_CONST.BUILDING_MIN_ZOOM} themeMode={themeMode} />
        <GridFocusList gridId={gridFocus} onClose={() => setGridFocus(null)} />
      </div>
      <BuildingPanel />
      {!MAP_CONST.PMTILES_URL && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-900 shadow">
          <code>NEXT_PUBLIC_PMTILES_URL</code> 미설정 — ETL 07 실행 후 .env에 추가
        </div>
      )}
    </div>
  );
}
