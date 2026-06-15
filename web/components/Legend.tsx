'use client';

import { legendItems, THEME_META, type ThemeMode } from '@/lib/themes';

export function Legend({
  zoom,
  buildingMinZoom,
  themeMode,
}: {
  zoom: number;
  buildingMinZoom: number;
  themeMode: ThemeMode;
}) {
  const mode = zoom >= buildingMinZoom ? '건물' : '격자';
  const items = legendItems(themeMode);
  const meta = THEME_META[themeMode];

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
        {meta.note ? `${meta.note} · 추정치` : '추정치 · 정성적 비교용'}
      </p>
    </div>
  );
}
