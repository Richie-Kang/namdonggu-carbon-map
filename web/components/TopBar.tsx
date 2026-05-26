'use client';

import { useAppStore } from '@/store';

export function TopBar() {
  const showBuildings = useAppStore((s) => s.showBuildings);
  const showGrid = useAppStore((s) => s.showGrid);
  const toggleLayer = useAppStore((s) => s.toggleLayer);
  return (
    <div className="absolute left-4 top-4 z-10 flex items-start gap-4">
      <div className="rounded-lg bg-white/95 px-4 py-2 shadow">
        <h1 className="text-base font-semibold">남동구 탄소지도</h1>
        <p className="text-xs text-slate-500">건물·지번 단위 시뮬레이터 · MVP</p>
      </div>
      <div className="rounded-lg bg-white/95 px-3 py-2 text-xs shadow">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={showBuildings}
            onChange={() => toggleLayer('showBuildings')}
          />
          건물
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={showGrid}
            onChange={() => toggleLayer('showGrid')}
          />
          100m 격자
        </label>
      </div>
    </div>
  );
}
