'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store';
import { useMapInit, applyVisibility, applyTheme, applyDongHighlight, MAP_CONST } from './useMapInit';
import { BuildingPanel } from './BuildingPanel';
import { Legend } from './Legend';
import { TopBar } from './TopBar';
import { GridFocusList } from './GridFocusList';

type Co2QuintileRow = { building_id: string; co2_quintile: number };

export default function MapView() {
  const setSelected = useAppStore((s) => s.setSelected);
  const selected = useAppStore((s) => s.selected);
  const showBuildings = useAppStore((s) => s.showBuildings);
  const showGrid = useAppStore((s) => s.showGrid);
  const showBoundary = useAppStore((s) => s.showBoundary);
  const showRoads = useAppStore((s) => s.showRoads);
  const themeMode = useAppStore((s) => s.themeMode);
  const co2Period = useAppStore((s) => s.co2Period);
  const co2SelectedMonth = useAppStore((s) => s.co2SelectedMonth);
  const co2SelectedYear = useAppStore((s) => s.co2SelectedYear);
  const industryFilter = useAppStore((s) => s.industryFilter);
  const selectedDong = useAppStore((s) => s.selectedDong);
  const { containerRef, mapRef, ready, zoom, gridFocus, setGridFocus, setPin, clearPin } =
    useMapInit(setSelected);
  const co2StateIdsRef = useRef<string[]>([]);

  useEffect(() => {
    if (mapRef.current && ready) {
      applyVisibility(mapRef.current, showBuildings, showGrid, showBoundary, showRoads);
    }
  }, [showBuildings, showGrid, showBoundary, showRoads, ready, mapRef]);

  useEffect(() => {
    if (mapRef.current && ready) {
      applyTheme(mapRef.current, themeMode, co2Period, industryFilter, selectedDong?.code ?? null);
    }
  }, [themeMode, co2Period, industryFilter, selectedDong, ready, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || themeMode !== 'co2') return;

    const params = new URLSearchParams({ period: co2Period });
    if (co2Period === 'monthly') {
      if (!co2SelectedMonth) return;
      params.set('yyyymm', co2SelectedMonth);
    } else {
      if (!co2SelectedYear) return;
      params.set('year', co2SelectedYear);
    }

    let cancelled = false;
    fetch(`/api/co2-quintiles?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`http_${r.status}`);
        return r.json() as Promise<{ rows: Co2QuintileRow[] }>;
      })
      .then(({ rows }) => {
        if (cancelled || !map.getSource('buildings-pmtiles')) return;
        for (const id of co2StateIdsRef.current) {
          map.removeFeatureState(
            { source: 'buildings-pmtiles', sourceLayer: 'buildings', id },
            'co2_quintile_override',
          );
        }
        co2StateIdsRef.current = [];
        for (const row of rows) {
          if (!row.building_id || !row.co2_quintile) continue;
          map.setFeatureState(
            { source: 'buildings-pmtiles', sourceLayer: 'buildings', id: row.building_id },
            { co2_quintile_override: row.co2_quintile },
          );
          co2StateIdsRef.current.push(row.building_id);
        }
      })
      .catch(() => {
        // Keep the baked-in tile colors if the period overlay cannot be loaded.
      });

    return () => {
      cancelled = true;
    };
  }, [co2Period, co2SelectedMonth, co2SelectedYear, ready, themeMode, mapRef]);

  useEffect(() => {
    if (mapRef.current && ready) {
      applyDongHighlight(mapRef.current, selectedDong);
    }
  }, [selectedDong, ready, mapRef]);

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
        <Legend
          zoom={zoom}
          buildingMinZoom={MAP_CONST.BUILDING_MIN_ZOOM}
          themeMode={themeMode}
          co2Period={co2Period}
        />
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
