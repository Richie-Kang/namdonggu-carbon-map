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
  const mode = zoom >= buildingMinZoom ? '건물 단위' : '100m 격자 단위';
  const items = legendItems(themeMode);
  const meta = THEME_META[themeMode];

  return (
    <div className="absolute bottom-4 left-4 z-10 rounded-lg bg-white/95 px-4 py-2 text-xs shadow">
      <div className="mb-1 font-semibold">
        {meta.label} · {mode}
      </div>
      <div className="flex items-center gap-1">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col items-center">
            <div className="h-4 w-8 rounded-sm" style={{ backgroundColor: item.color }} />
            <div className="mt-0.5 text-[10px] text-slate-600 whitespace-nowrap">{item.label}</div>
          </div>
        ))}
      </div>
      {meta.note && (
        <p className="mt-1 text-[10px] text-slate-500">{meta.note} · 추정치</p>
      )}
      {!meta.note && (
        <p className="mt-1 text-[10px] text-slate-500">추정치 · 정성적 비교용</p>
      )}
    </div>
  );
}
