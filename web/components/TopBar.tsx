'use client';

import { useAppStore } from '@/store';
import { SearchBox } from './SearchBox';

export function TopBar({ onFly }: { onFly: (lon: number, lat: number) => void }) {
  const showBuildings = useAppStore((s) => s.showBuildings);
  const showGrid = useAppStore((s) => s.showGrid);
  const showBoundary = useAppStore((s) => s.showBoundary);
  const showRoads = useAppStore((s) => s.showRoads);
  const toggleLayer = useAppStore((s) => s.toggleLayer);
  return (
    <div className="absolute left-4 top-4 z-10 flex max-w-[calc(100%-32px)] items-start gap-3">
      <div className="rounded-lg bg-white px-4 py-2 shadow ring-1 ring-black/10">
        <h1 className="text-base font-semibold">남동구 탄소지도</h1>
        <p className="text-[11px] text-slate-500">건물·지번 단위 시뮬레이터 · MVP</p>
      </div>
      <SearchBox onFly={onFly} />
      <div className="rounded-lg bg-white px-3 py-2 text-xs shadow ring-1 ring-black/10 space-y-0.5">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showBuildings} onChange={() => toggleLayer('showBuildings')} />
          건물
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showGrid} onChange={() => toggleLayer('showGrid')} />
          100m 격자
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showBoundary} onChange={() => toggleLayer('showBoundary')} />
          행정경계
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showRoads} onChange={() => toggleLayer('showRoads')} />
          도로
        </label>
      </div>
    </div>
  );
}
