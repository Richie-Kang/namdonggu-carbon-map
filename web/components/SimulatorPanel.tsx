'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store';

type PredictRes = {
  co2_pred: number;
  delta_kg: number;
  breakdown: { electricity_kwh: number; gas_m3: number };
  warnings?: string[];
};

function debounce<T extends (...args: never[]) => void>(fn: T, ms = 300): T {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

const LAND_USES = [
  { v: 'residential', label: '주거' },
  { v: 'commercial', label: '상업' },
  { v: 'industrial', label: '산업' },
  { v: 'other', label: '기타' },
];

export function SimulatorPanel() {
  const selected = useAppStore((s) => s.selected);
  const sim = useAppStore((s) => s.simInputs);
  const setSim = useAppStore((s) => s.setSim);
  const [result, setResult] = useState<PredictRes | null>(null);
  const [loading, setLoading] = useState(false);

  const trigger = useMemo(() => debounce(async (payload: typeof sim & { building_id: string }) => {
    setLoading(true);
    try {
      const r = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        setResult(null);
        return;
      }
      const data = (await r.json()) as PredictRes;
      setResult(data);
    } finally {
      setLoading(false);
    }
  }, 300), []);

  useEffect(() => {
    if (!selected) return;
    trigger({ ...sim, building_id: selected.building_id, use_main_code: sim.use_main_code || (selected.use_main_code ?? '01000') });
  }, [sim, selected, trigger]);

  if (!selected) return null;
  const delta = result?.delta_kg ?? 0;
  const sign = delta > 0 ? '+' : '';
  const color = delta > 0 ? 'text-red-600' : delta < 0 ? 'text-emerald-700' : 'text-slate-700';

  return (
    <section className="absolute bottom-4 right-4 z-10 w-[360px] rounded-lg bg-white/97 p-4 shadow-lg">
      <h3 className="text-sm font-semibold">시뮬레이터</h3>
      <p className="text-[10px] text-slate-500">건물·토지·인구 변경 시 예상 ΔCO₂</p>

      <label className="mt-2 block text-xs">주용도 코드
        <input
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          value={sim.use_main_code}
          placeholder={selected.use_main_code ?? '01000'}
          onChange={(e) => setSim('use_main_code', e.target.value)}
        />
      </label>

      <label className="mt-2 block text-xs">토지용도
        <select
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          value={sim.land_use_category}
          onChange={(e) => setSim('land_use_category', e.target.value)}
        >
          {LAND_USES.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
      </label>

      <label className="mt-2 block text-xs">
        상주인구 변화: <strong>{sim.pop_delta_pct}%</strong>
        <input
          type="range"
          min={-100}
          max={200}
          step={5}
          className="mt-1 w-full"
          value={sim.pop_delta_pct}
          onChange={(e) => setSim('pop_delta_pct', Number(e.target.value))}
        />
      </label>

      <div className="mt-3 rounded bg-slate-50 p-2">
        <div className="text-xs text-slate-600">예상 CO₂</div>
        <div className="text-xl font-semibold">
          {(result?.co2_pred ?? 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 })} kg/월
        </div>
        <div className={`text-sm ${color}`}>
          Δ {sign}{Math.round(delta).toLocaleString('ko-KR')} kg
        </div>
        {loading && <p className="text-[10px] text-slate-400">계산 중…</p>}
        {result?.warnings?.map((w) => (
          <p key={w} className="text-[10px] text-amber-700">⚠ {w}</p>
        ))}
      </div>
    </section>
  );
}
