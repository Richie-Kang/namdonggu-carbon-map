'use client';

import { legendItems, themeNote, THEME_META, type ThemeMode } from '@/lib/themes';
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
  const items = legendItems(themeMode, co2Period);
  const meta = THEME_META[themeMode];
  const note = themeNote(themeMode, co2Period);

  return (
    <div className="rounded-xl bg-white/95 px-4 py-3 shadow-lg ring-1 ring-black/10 backdrop-blur-sm">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <span className="text-sm font-semibold text-slate-700">{meta.label}</span>
        <span className="text-[11px] text-slate-400">{mode} 단위</span>
      </div>
      <div className="flex items-end gap-1.5">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col items-center">
            <div className="h-3.5 w-8 rounded" style={{ backgroundColor: item.color }} />
            <div className="mt-1 text-[10px] whitespace-nowrap text-slate-500">{item.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-400">
        {note ? `${note} · 추정치` : '추정치 · 정성적 비교용'}
      </p>
    </div>
  );
}
