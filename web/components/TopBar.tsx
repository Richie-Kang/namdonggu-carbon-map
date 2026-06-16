'use client';

import { useEffect, useMemo, useState } from 'react';
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

type Co2Periods = { months: string[]; years: string[] };

async function fetchCo2Periods(url: string): Promise<Co2Periods> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`http_${r.status}`);
  return r.json() as Promise<Co2Periods>;
}

function monthLabel(yyyymm: string, showYear: boolean): string {
  const month = Number(yyyymm.slice(4, 6));
  return showYear ? `${yyyymm.slice(2, 4)}.${month}월` : `${month}월`;
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
  const co2SelectedMonth = useAppStore((s) => s.co2SelectedMonth);
  const co2SelectedYear = useAppStore((s) => s.co2SelectedYear);
  const industryFilter = useAppStore((s) => s.industryFilter);
  const setTheme = useAppStore((s) => s.setTheme);
  const setCo2Period = useAppStore((s) => s.setCo2Period);
  const setCo2SelectedMonth = useAppStore((s) => s.setCo2SelectedMonth);
  const setCo2SelectedYear = useAppStore((s) => s.setCo2SelectedYear);
  const setIndustryFilter = useAppStore((s) => s.setIndustryFilter);
  const selectedDong = useAppStore((s) => s.selectedDong);
  const setSelectedDong = useAppStore((s) => s.setSelectedDong);

  const [open, setOpen] = useState({ layer: true, period: true, theme: true, industry: false, dong: true });
  function toggle(key: keyof typeof open) {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const { data: dongData } = useSWR('/api/dongs', fetchDongs, {
    revalidateOnFocus: false,
  });
  const { data: co2Periods } = useSWR('/api/co2-periods', fetchCo2Periods, {
    revalidateOnFocus: false,
  });
  const months = useMemo(() => co2Periods?.months ?? [], [co2Periods?.months]);
  const years = useMemo(() => co2Periods?.years ?? [], [co2Periods?.years]);
  const hasDuplicateMonthNumbers = new Set(months.map((yyyymm) => yyyymm.slice(4, 6))).size !== months.length;

  useEffect(() => {
    const firstMonth = months[0] ?? null;
    const firstYear = years[0] ?? null;
    if (firstMonth && (!co2SelectedMonth || !months.includes(co2SelectedMonth))) {
      setCo2SelectedMonth(firstMonth);
    }
    if (firstYear && (!co2SelectedYear || !years.includes(co2SelectedYear))) {
      setCo2SelectedYear(firstYear);
    }
  }, [co2SelectedMonth, co2SelectedYear, months, years, setCo2SelectedMonth, setCo2SelectedYear]);

  return (
    <div className="absolute left-4 top-4 z-10 flex items-start gap-3">
      {/* 왼쪽 세로 컬럼: 타이틀 + 컨트롤 패널 */}
      <div className="flex w-60 flex-col gap-2">

        {/* 타이틀 카드 */}
        <div className="rounded-xl bg-emerald-500 px-5 py-4 shadow-lg">
          <div className="mb-1.5 flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-white/60" />
            <span className="text-xs font-semibold uppercase tracking-widest text-white/70">
              DPM
            </span>
          </div>
          <h1 className="text-lg font-bold leading-tight text-white">남동구 탄소지도</h1>
          <p className="mt-1 text-xs text-emerald-100">탄소배출 분석 · 시뮬레이션 서비스</p>
        </div>

        {/* 컨트롤 패널 */}
        <div className="overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/10 text-sm">

          {/* 레이어 */}
          <div className="px-4 pb-3 pt-4">
            <button
              type="button"
              onClick={() => toggle('layer')}
              className="mb-1.5 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-widest text-slate-400 hover:text-slate-600"
            >
              레이어
              <span className={`text-base leading-none transition-transform duration-200 ${open.layer ? 'rotate-0' : '-rotate-90'}`}>▾</span>
            </button>
            {open.layer && (
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
            )}
          </div>

          <div className="mx-4 h-px bg-slate-100" />

          {/* 기간 */}
          {themeMode === 'co2' && (
            <>
              <div className="px-4 pb-3 pt-3">
                <button
                  type="button"
                  onClick={() => toggle('period')}
                  className="mb-1.5 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-widest text-slate-400 hover:text-slate-600"
                >
                  기간
                  <span className={`text-base leading-none transition-transform duration-200 ${open.period ? 'rotate-0' : '-rotate-90'}`}>▾</span>
                </button>
                {open.period && (
                  <div className="space-y-1.5 text-xs" aria-label="CO2 표시 기간">
                    <div className="flex rounded-md bg-slate-100 p-0.5">
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
                    {co2Period === 'monthly' && months.length > 0 && (
                      <div className="grid max-h-24 grid-cols-3 gap-1 overflow-y-auto rounded-md bg-slate-50 p-1">
                        {months.map((yyyymm) => (
                          <button
                            key={yyyymm}
                            type="button"
                            onClick={() => setCo2SelectedMonth(yyyymm)}
                            className={`rounded px-1.5 py-1 ${
                              co2SelectedMonth === yyyymm
                                ? 'bg-slate-800 font-semibold text-white'
                                : 'text-slate-600 hover:bg-white'
                            }`}
                          >
                            {monthLabel(yyyymm, hasDuplicateMonthNumbers)}
                          </button>
                        ))}
                      </div>
                    )}
                    {co2Period === 'annual' && years.length > 0 && (
                      <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-50 p-1">
                        {years.map((year) => (
                          <button
                            key={year}
                            type="button"
                            onClick={() => setCo2SelectedYear(year)}
                            className={`rounded px-1.5 py-1 ${
                              co2SelectedYear === year
                                ? 'bg-slate-800 font-semibold text-white'
                                : 'text-slate-600 hover:bg-white'
                            }`}
                          >
                            {year}년
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="mx-4 h-px bg-slate-100" />
            </>
          )}

          {/* 주제도 */}
          <div className="px-4 py-3">
            <button
              type="button"
              onClick={() => toggle('theme')}
              className="mb-1.5 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-widest text-slate-400 hover:text-slate-600"
            >
              주제도
              <span className={`text-base leading-none transition-transform duration-200 ${open.theme ? 'rotate-0' : '-rotate-90'}`}>▾</span>
            </button>
            {open.theme && (
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
            )}
          </div>

          <div className="mx-4 h-px bg-slate-100" />

          {/* 업종 필터 */}
          <div className="px-4 pb-4 pt-3">
            <button
              type="button"
              onClick={() => toggle('industry')}
              className="mb-1.5 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-widest text-slate-400 hover:text-slate-600"
            >
              업종 필터
              <span className={`text-base leading-none transition-transform duration-200 ${open.industry ? 'rotate-0' : '-rotate-90'}`}>▾</span>
            </button>
            {open.industry && (
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
            )}
          </div>

          <div className="mx-4 h-px bg-slate-100" />

          {/* 행정동 필터 */}
          <div className="px-4 pb-4 pt-3">
            <button
              type="button"
              onClick={() => toggle('dong')}
              className="mb-1.5 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-widest text-slate-400 hover:text-slate-600"
            >
              행정동
              <span className={`text-base leading-none transition-transform duration-200 ${open.dong ? 'rotate-0' : '-rotate-90'}`}>▾</span>
            </button>
            {open.dong && (
              <select
                value={selectedDong?.code ?? ''}
                onChange={(e) => {
                  const code = e.target.value;
                  if (!code) { setSelectedDong(null); return; }
                  const found = dongData?.dongs.find((d) => d.code === code);
                  if (found) setSelectedDong(found);
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
              >
                <option value="">전체 (남동구)</option>
                {(dongData?.dongs ?? []).map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </div>

        </div>
      </div>

      {/* 검색창 */}
      <SearchBox onFly={onFly} />
    </div>
  );
}
