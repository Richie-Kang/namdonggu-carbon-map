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

// 컨트롤 패널 공유 내용 (데스크탑 사이드바 / 모바일 드로어에서 모두 사용)
function ControlContent({
  dongData,
  months,
  years,
  hasDuplicateMonthNumbers,
  onClose,
}: {
  dongData: { dongs: DongItem[] } | undefined;
  months: string[];
  years: string[];
  hasDuplicateMonthNumbers: boolean;
  onClose?: () => void;
}) {
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

  return (
    <div className="text-sm">
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
          <div className="grid grid-cols-2 gap-0.5 lg:block lg:space-y-0.5">
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
                className={`flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-2 transition-colors hover:bg-slate-50 lg:py-1 ${
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
                    className={`flex-1 rounded px-2 py-1 ${
                      co2Period === 'monthly' ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    월별
                  </button>
                  <button
                    type="button"
                    onClick={() => setCo2Period('annual')}
                    className={`flex-1 rounded px-2 py-1 ${
                      co2Period === 'annual' ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    연간
                  </button>
                </div>
                {co2Period === 'monthly' && months.length > 0 && (
                  <div className="grid max-h-28 grid-cols-4 gap-1 overflow-y-auto rounded-md bg-slate-50 p-1 lg:grid-cols-3 lg:max-h-24">
                    {months.map((yyyymm) => (
                      <button
                        key={yyyymm}
                        type="button"
                        onClick={() => {
                          setCo2SelectedMonth(yyyymm);
                          onClose?.();
                        }}
                        className={`rounded px-1.5 py-1.5 lg:py-1 ${
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
                  <div className="grid grid-cols-3 gap-1 rounded-md bg-slate-50 p-1 lg:grid-cols-2">
                    {years.map((year) => (
                      <button
                        key={year}
                        type="button"
                        onClick={() => {
                          setCo2SelectedYear(year);
                          onClose?.();
                        }}
                        className={`rounded px-1.5 py-1.5 lg:py-1 ${
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
          <div className="grid grid-cols-2 gap-0.5 lg:block lg:space-y-0.5">
            {THEMES.map(([key, meta]) => (
              <label
                key={key}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-2 transition-colors lg:py-1 ${
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
                  onChange={() => {
                    setTheme(key);
                    onClose?.();
                  }}
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
          <div className="grid grid-cols-2 gap-0.5 lg:block lg:space-y-0.5">
            {FILTERS.map(([key, label]) => (
              <label
                key={key}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-2 transition-colors lg:py-1 ${
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
                  onChange={() => {
                    setIndustryFilter(key);
                    onClose?.();
                  }}
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
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none lg:py-1.5"
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
  );
}

export function TopBar({ onFly }: { onFly: (lon: number, lat: number) => void }) {
  const { data: dongData } = useSWR('/api/dongs', fetchDongs, {
    revalidateOnFocus: false,
  });
  const { data: co2Periods } = useSWR('/api/co2-periods', fetchCo2Periods, {
    revalidateOnFocus: false,
  });
  const months = useMemo(() => co2Periods?.months ?? [], [co2Periods?.months]);
  const years = useMemo(() => co2Periods?.years ?? [], [co2Periods?.years]);
  const hasDuplicateMonthNumbers = new Set(months.map((yyyymm) => yyyymm.slice(4, 6))).size !== months.length;

  const co2SelectedMonth = useAppStore((s) => s.co2SelectedMonth);
  const co2SelectedYear = useAppStore((s) => s.co2SelectedYear);
  const setCo2SelectedMonth = useAppStore((s) => s.setCo2SelectedMonth);
  const setCo2SelectedYear = useAppStore((s) => s.setCo2SelectedYear);
  const mobileControlDrawerOpen = useAppStore((s) => s.mobileControlDrawerOpen);
  const setMobileControlDrawerOpen = useAppStore((s) => s.setMobileControlDrawerOpen);
  const themeMode = useAppStore((s) => s.themeMode);
  const co2Period = useAppStore((s) => s.co2Period);

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

  // 활성 필터 상태 요약 텍스트 (모바일 버튼에 표시)
  const activeLabel = useMemo(() => {
    const labelMap: Record<string, string> = {
      co2: 'CO₂', population: '인구', land_use: '토지이용', energy: '에너지',
    };
    const base = labelMap[themeMode] ?? themeMode;
    if (themeMode === 'co2') {
      if (co2Period === 'monthly' && co2SelectedMonth) {
        const m = Number(co2SelectedMonth.slice(4, 6));
        return `${base} · ${m}월`;
      }
      if (co2Period === 'annual' && co2SelectedYear) {
        return `${base} · ${co2SelectedYear}년`;
      }
    }
    return base;
  }, [themeMode, co2Period, co2SelectedMonth, co2SelectedYear]);

  return (
    <>
      {/* ── 데스크탑: 기존 레이아웃 (lg 이상) ── */}
      <div className="absolute left-4 top-4 z-10 hidden items-start gap-3 lg:flex">
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
            <p className="mt-1 text-xs text-emerald-100 whitespace-nowrap">탄소배출 분석 · 시뮬레이션 서비스</p>
          </div>

          {/* 컨트롤 패널 */}
          <div className="overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/10">
            <ControlContent
              dongData={dongData}
              months={months}
              years={years}
              hasDuplicateMonthNumbers={hasDuplicateMonthNumbers}
            />
          </div>
        </div>

        {/* 검색창 */}
        <SearchBox onFly={onFly} />
      </div>

      {/* ── 모바일: 상단 바 (lg 미만) ── */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center gap-2 px-3 pt-3 lg:hidden">
        {/* 타이틀 */}
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2.5 shadow-lg shrink-0">
          <div className="h-1.5 w-1.5 rounded-full bg-white/60" />
          <span className="text-sm font-bold text-white">남동구 탄소지도</span>
        </div>

        {/* 검색창 (flex-1로 나머지 공간 차지) */}
        <div className="flex-1 min-w-0">
          <SearchBox onFly={onFly} mobile />
        </div>

        {/* 레이어/필터 버튼 */}
        <button
          type="button"
          onClick={() => setMobileControlDrawerOpen(true)}
          className="flex shrink-0 flex-col items-center justify-center rounded-xl bg-white px-3 py-2.5 shadow-lg ring-1 ring-black/10"
          aria-label="지도 설정"
        >
          <svg className="h-4 w-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c-1.2 5.4-5 7-8 8 3 1 6.8 2.6 8 8 1.2-5.4 5-7 8-8-3-1-6.8-2.6-8-8z" />
          </svg>
          <span className="mt-0.5 text-[10px] font-medium text-slate-500 leading-none">{activeLabel}</span>
        </button>
      </div>

      {/* ── 모바일 컨트롤 드로어 ── */}
      {mobileControlDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" aria-modal="true">
          {/* 배경 딤 */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={() => setMobileControlDrawerOpen(false)}
          />

          {/* 드로어 패널 */}
          <div className="absolute bottom-0 left-0 right-0 max-h-[85dvh] overflow-hidden rounded-t-2xl bg-white shadow-2xl flex flex-col">
            {/* 드래그 핸들 */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="h-1 w-10 rounded-full bg-slate-200" />
            </div>

            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 pb-3 pt-1 shrink-0">
              <h2 className="text-base font-bold text-slate-900">지도 설정</h2>
              <button
                type="button"
                onClick={() => setMobileControlDrawerOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="닫기"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>

            {/* 콘텐츠 스크롤 영역 */}
            <div className="overflow-y-auto overscroll-contain">
              <ControlContent
                dongData={dongData}
                months={months}
                years={years}
                hasDuplicateMonthNumbers={hasDuplicateMonthNumbers}
                onClose={() => setMobileControlDrawerOpen(false)}
              />
              {/* 하단 safe area 여백 */}
              <div className="h-safe-bottom pb-6" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
