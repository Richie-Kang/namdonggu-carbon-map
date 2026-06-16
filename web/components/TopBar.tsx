'use client';

import useSWR from 'swr';
import { useAppStore } from '@/store';
import { SearchBox } from './SearchBox';
import {
  THEME_META,
  INDUSTRY_FILTER_META,
  type ThemeMode,
  type IndustryFilter,
} from '@/lib/themes';
import type { DongItem } from '@/app/api/dongs/route';

async function fetchDongs(url: string): Promise<{ dongs: DongItem[] }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`http_${r.status}`);
  return r.json() as Promise<{ dongs: DongItem[] }>;
}

const THEMES = Object.entries(THEME_META) as [ThemeMode, { label: string }][];
const FILTERS = Object.entries(INDUSTRY_FILTER_META) as [IndustryFilter, string][];

export function TopBar({ onFly }: { onFly: (lon: number, lat: number) => void }) {
  const showBuildings = useAppStore((s) => s.showBuildings);
  const showGrid = useAppStore((s) => s.showGrid);
  const showBoundary = useAppStore((s) => s.showBoundary);
  const showRoads = useAppStore((s) => s.showRoads);
  const toggleLayer = useAppStore((s) => s.toggleLayer);
  const themeMode = useAppStore((s) => s.themeMode);
  const co2Period = useAppStore((s) => s.co2Period);
  const industryFilter = useAppStore((s) => s.industryFilter);
  const setTheme = useAppStore((s) => s.setTheme);
  const setCo2Period = useAppStore((s) => s.setCo2Period);
  const setIndustryFilter = useAppStore((s) => s.setIndustryFilter);
  const selectedDong = useAppStore((s) => s.selectedDong);
  const setSelectedDong = useAppStore((s) => s.setSelectedDong);

  const { data: dongData } = useSWR('/api/dongs', fetchDongs, {
    revalidateOnFocus: false,
  });

  return (
    <div className="absolute left-4 top-4 z-10 flex items-start gap-3">
      {/* 왼쪽 세로 컬럼: 타이틀 + 컨트롤 패널 */}
      <div className="flex flex-col gap-2">

        {/* 타이틀 카드 */}
        <div className="rounded-xl bg-slate-800 px-4 py-3 shadow-lg">
          <div className="mb-1 flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
              탄소중립
            </span>
          </div>
          <h1 className="text-base font-bold leading-tight text-white">남동구 탄소지도</h1>
          <p className="mt-0.5 text-[11px] text-slate-400">건물·지번 단위 시뮬레이터</p>
        </div>

        {/* 컨트롤 패널 */}
        <div className="overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/10 text-[13px]">

          {/* 레이어 */}
          <div className="px-3 pb-2 pt-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              레이어
            </p>
            <div className="space-y-0.5">
              {(
                [
                  ['showBuildings', '건물', showBuildings],
                  ['showGrid', '100m 격자', showGrid],
                  ['showBoundary', '행정경계', showBoundary],
                  ['showRoads', '도로', showRoads],
                ] as const
              ).map(([key, label, checked]) => (
                <label
                  key={key}
                  className={`flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-slate-50 ${
                    checked ? 'text-slate-800' : 'text-slate-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleLayer(key)}
                    className="accent-slate-700"
                  />
                  {label}
                </label>
              ))}
            </div>
            {themeMode === 'co2' && (
              <div className="mt-2 flex rounded-md bg-slate-100 p-0.5 text-[11px]" aria-label="CO2 표시 기간">
                <button
                  type="button"
                  onClick={() => setCo2Period('monthly')}
                  className={`flex-1 rounded px-2 py-0.5 ${
                    co2Period === 'monthly' ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  월별
                </button>
                <button
                  type="button"
                  onClick={() => setCo2Period('annual')}
                  className={`flex-1 rounded px-2 py-0.5 ${
                    co2Period === 'annual' ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  연간
                </button>
              </div>
            )}
          </div>

          <div className="mx-3 h-px bg-slate-100" />

          {/* 주제도 */}
          <div className="px-3 py-2">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              주제도
            </p>
            <div className="space-y-0.5">
              {THEMES.map(([key, meta]) => (
                <label
                  key={key}
                  className={`flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors ${
                    themeMode === key
                      ? 'bg-slate-100 font-semibold text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="themeMode"
                    value={key}
                    checked={themeMode === key}
                    onChange={() => setTheme(key)}
                    className="accent-slate-700"
                  />
                  {meta.label}
                </label>
              ))}
            </div>
          </div>

          <div className="mx-3 h-px bg-slate-100" />

          {/* 업종 필터 */}
          <div className="px-3 pb-3 pt-2">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              업종 필터
            </p>
            <div className="space-y-0.5">
              {FILTERS.map(([key, label]) => (
                <label
                  key={key}
                  className={`flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors ${
                    industryFilter === key
                      ? 'bg-slate-100 font-semibold text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="industryFilter"
                    value={key}
                    checked={industryFilter === key}
                    onChange={() => setIndustryFilter(key)}
                    className="accent-slate-700"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="mx-3 h-px bg-slate-100" />

          {/* 행정동 필터 */}
          <div className="px-3 pb-3 pt-2">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              행정동
            </p>
            <select
              value={selectedDong?.code ?? ''}
              onChange={(e) => {
                const code = e.target.value;
                if (!code) { setSelectedDong(null); return; }
                const found = dongData?.dongs.find((d) => d.code === code);
                if (found) setSelectedDong(found);
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 focus:border-slate-400 focus:outline-none"
            >
              <option value="">전체 (남동구)</option>
              {(dongData?.dongs ?? []).map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

        </div>
      </div>

      {/* 검색창 */}
      <SearchBox onFly={onFly} />
    </div>
  );
}
