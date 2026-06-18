'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store';

type TopRow = {
  building_id: string;
  label: string | null;
  address_jibun: string | null;
  address_road: string | null;
  use_main: string | null;
  co2_kg_month: number | null;
};

type Summary = {
  grid?: {
    grid_id: string;
    co2_kg_month: number | null;
    building_count: number | null;
    land_use_category: string | null;
  };
  dong?: string | null;
  top_buildings?: TopRow[];
  // legacy field for safety
  rows?: TopRow[];
  error?: string;
};

function nf(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
}

function buildingDisplayName(r: TopRow): string {
  if (r.label) return r.label;
  if (r.address_jibun) return r.address_jibun.replace(/^인천광역시\s+남동구\s+/, '');
  return '이름 미상';
}

export function GridFocusList({ gridId, onClose }: { gridId: string | null; onClose: () => void }) {
  const setSelected = useAppStore((s) => s.setSelected);
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    if (!gridId) { setData(null); return; }
    let cancelled = false;
    fetch(`/api/grid/top?grid_id=${encodeURIComponent(gridId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (!cancelled) setData(d as Summary); })
      .catch(() => { if (!cancelled) setData({ error: 'fetch_failed' }); });
    return () => { cancelled = true; };
  }, [gridId]);

  if (!gridId) return null;
  const rows: TopRow[] = data?.top_buildings ?? data?.rows ?? [];
  const dong = (data?.dong || '').trim();
  const headerAddr = dong ? `남동구 ${dong}` : '남동구';
  const total = data?.grid?.co2_kg_month;
  const bcount = data?.grid?.building_count;
  const landUse = data?.grid?.land_use_category;

  return (
    <aside className="w-[260px] rounded-xl bg-white p-3 shadow-2xl ring-1 ring-black/10 text-sm lg:w-[320px]">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="truncate font-semibold leading-tight text-sm" title={`인천광역시 ${headerAddr}`}>
            {headerAddr}
          </div>
          <div className="truncate text-[11px] text-slate-500">
            100m 격자{landUse ? ` · ${landUse}` : ''}
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100"
          aria-label="닫기"
        >✕</button>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs">
        <dt className="text-slate-500">합계 CO₂</dt>
        <dd className="text-right">{nf(total)} kg/월</dd>
        <dt className="text-slate-500">건물 수</dt>
        <dd className="text-right">{bcount ?? '—'}</dd>
      </dl>

      <h4 className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">상위 배출 건물</h4>
      <ul className="mt-1 space-y-1">
        {rows.length === 0 && <li className="text-[11px] text-slate-500">데이터 없음</li>}
        {rows.map((r) => (
          <li key={r.building_id}>
            <button
              className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50 active:bg-slate-100 lg:py-1"
              onClick={() =>
                setSelected({
                  building_id: r.building_id,
                  name: r.label,
                  use_main: r.use_main,
                  co2_kg_month: r.co2_kg_month,
                })
              }
            >
              <div className="truncate text-sm font-medium" title={buildingDisplayName(r)}>
                {buildingDisplayName(r)}
              </div>
              <div className="flex items-baseline justify-between gap-2 text-[10px] text-slate-500">
                <span className="truncate">{r.use_main ?? '용도 미상'}</span>
                <span className="shrink-0">{nf(r.co2_kg_month)} kg/월</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
