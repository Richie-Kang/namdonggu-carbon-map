'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store';

type Row = { building_id: string; name: string | null; co2_kg_month: number | null };

export function GridFocusList({ gridId, onClose }: { gridId: string | null; onClose: () => void }) {
  const setSelected = useAppStore((s) => s.setSelected);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!gridId) { setRows(null); return; }
    let cancelled = false;
    fetch(`/api/grid/top?grid_id=${encodeURIComponent(gridId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => { if (!cancelled) setRows(data.rows ?? []); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [gridId]);

  if (!gridId) return null;
  return (
    <aside className="absolute right-4 top-4 z-10 w-[280px] rounded-lg bg-white/97 p-3 shadow-lg text-sm">
      <div className="flex items-center justify-between">
        <div className="font-semibold">격자 {gridId}</div>
        <button onClick={onClose} className="text-xs text-slate-500" aria-label="닫기">✕</button>
      </div>
      <p className="text-[10px] text-slate-500">상위 5 배출 건물</p>
      <ul className="mt-2 space-y-1">
        {(rows ?? []).map((r) => (
          <li key={r.building_id}>
            <button
              className="text-left w-full hover:bg-slate-50 rounded px-1 py-0.5"
              onClick={() => setSelected({ building_id: r.building_id, name: r.name })}
            >
              <div className="text-sm">{r.name ?? r.building_id}</div>
              <div className="text-[10px] text-slate-500">
                {(r.co2_kg_month ?? 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 })} kg/월
              </div>
            </button>
          </li>
        ))}
        {rows && rows.length === 0 && <li className="text-xs text-slate-500">데이터 없음</li>}
      </ul>
    </aside>
  );
}
