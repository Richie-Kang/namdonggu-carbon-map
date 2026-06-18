'use client';

import { gridLegendItems, legendItems, themeNote, THEME_META, type ThemeMode } from '@/lib/themes';
import type { UsageUnit } from '@/lib/simulation-utils';

export function Legend({
  zoom,
  buildingMinZoom,
  themeMode,
  co2Period,
}: {
  zoom: number;
  buildingMinZoom: number;
  themeMode: ThemeMode;
  co2Period: UsageUnit;
}) {
  const mode = zoom >= buildingMinZoom ? '건물' : '격자';
  const isGridMode = zoom < buildingMinZoom;
  const items = isGridMode ? gridLegendItems(themeMode) : legendItems(themeMode, co2Period);
  const meta = THEME_META[themeMode];
  const note = themeNote(themeMode, co2Period);

  return (
    <div className="rounded-xl bg-white/95 px-3 py-2.5 shadow-lg ring-1 ring-black/10 backdrop-blur-sm lg:px-5 lg:py-4">
      <div className="mb-2 flex items-baseline justify-between gap-3 lg:mb-2.5 lg:gap-4">
        <span className="text-xs font-semibold text-slate-700 lg:text-sm">{meta.label}</span>
        <span className="text-[10px] text-slate-400 lg:text-xs">{mode} 단위</span>
      </div>
      <div className="flex items-end gap-1.5 lg:gap-2">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col items-center">
            <div className="h-3 w-7 rounded lg:h-4 lg:w-10" style={{ backgroundColor: item.color }} />
            <div className="mt-0.5 text-[9px] whitespace-nowrap text-slate-500 lg:mt-1 lg:text-xs">{item.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[9px] text-slate-400 lg:mt-2.5 lg:text-xs">
        {note ? `${note} · ${isGridMode && themeMode === 'co2' ? '격자 내 상대분포' : '추정치'}` : '추정치 · 정성적 비교용'}
      </p>
    </div>
  );
}
