'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAppStore } from '@/store';
import { USE_MAIN_CODES, LAND_USE_CATEGORIES, labelForUseCode } from '@/lib/use-codes';

const SimulationChart = dynamic(() => import('./SimulationChart').then((m) => m.SimulationChart), {
  ssr: false,
  loading: () => <div className="h-44 w-full animate-pulse rounded bg-slate-100" />,
});

type EnergyRow = { yyyymm: string; electricity_kwh: number; gas_m3: number; co2_kg: number };
type PredictRes = {
  co2_pred: number;
  delta_kg: number;
  breakdown: { electricity_kwh: number; gas_m3: number };
  population_baseline: number;
  population_used: number;
  industry_multiplier?: number;
  industry_label?: string;
  warnings?: string[];
};

function debounce<T extends (...args: never[]) => void>(fn: T, ms = 300): T {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

function average(rows: EnergyRow[], key: keyof EnergyRow): number {
  if (!rows.length) return 0;
  const sum = rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
  return sum / rows.length;
}

function nf(n: number): string {
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
}

function ni(n: number): string {
  return Math.round(n).toLocaleString('ko-KR');
}

export function SimulationTab({
  buildingId,
  currentBuilding,
  energy,
  industryCode,
}: {
  buildingId: string;
  currentBuilding: Record<string, unknown>;
  energy: EnergyRow[];
  industryCode?: string | null;
}) {
  const sim = useAppStore((s) => s.simInputs);
  const setSim = useAppStore((s) => s.setSim);
  const [result, setResult] = useState<PredictRes | null>(null);
  const [popBaseline, setPopBaseline] = useState<number | null>(null);
  const [popTarget, setPopTarget] = useState<number | null>(null);

  // null = 자동(인구 기반 계산), number = 사용자가 직접 지정한 값
  const [elecOverride, setElecOverride] = useState<number | null>(null);
  const [gasOverride, setGasOverride] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);

  const current = useMemo(() => {
    const elec = average(energy, 'electricity_kwh');
    const gas = average(energy, 'gas_m3');
    const co2 = Number(currentBuilding.co2_kg_month) || elec * 0.4781 + gas * 2.176;
    return { electricity_kwh: elec, gas_m3: gas, co2_kg_month: co2 };
  }, [energy, currentBuilding]);

  // Reset all overrides whenever a new building is opened.
  useEffect(() => {
    setResult(null);
    setPopBaseline(null);
    setPopTarget(null);
    setElecOverride(null);
    setGasOverride(null);
  }, [buildingId]);

  const callPredict = useMemo(
    () =>
      debounce(
        async (payload: {
          use_main_code: string;
          land_use_category: string;
          target_population?: number;
          target_electricity_kwh?: number;
          target_gas_m3?: number;
          industry_code?: string;
        }) => {
          setLoading(true);
          try {
            const r = await fetch('/api/predict', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...payload, building_id: buildingId }),
            });
            if (!r.ok) {
              setResult(null);
              return;
            }
            const data = (await r.json()) as PredictRes;
            setResult(data);
            setPopBaseline((prev) => prev ?? data.population_baseline);
            setPopTarget((prev) => prev ?? Math.round(data.population_baseline));
          } finally {
            setLoading(false);
          }
        },
        250,
      ),
    [buildingId],
  );

  useEffect(() => {
    const useCode =
      sim.use_main_code ||
      ((currentBuilding.use_main_code as string | undefined) ?? '') ||
      '04000';
    const landCat = sim.land_use_category || 'commercial';
    callPredict({
      use_main_code: useCode,
      land_use_category: landCat,
      target_population: popTarget ?? undefined,
      target_electricity_kwh: elecOverride ?? undefined,
      target_gas_m3: gasOverride ?? undefined,
      industry_code: industryCode ?? undefined,
    });
  }, [
    sim.use_main_code,
    sim.land_use_category,
    popTarget,
    elecOverride,
    gasOverride,
    industryCode,
    callPredict,
    currentBuilding.use_main_code,
  ]);

  const delta = result ? result.co2_pred - current.co2_kg_month : 0;
  const sign = delta > 0 ? '+' : '';
  const color = delta > 0 ? 'text-red-600' : delta < 0 ? 'text-emerald-700' : 'text-slate-700';

  const currentLabel = labelForUseCode((currentBuilding.use_main_code as string) ?? null);
  const baselineInt = popBaseline ? Math.round(popBaseline) : null;
  const targetInt = popTarget ?? baselineInt ?? 0;
  const popDelta = baselineInt != null ? targetInt - baselineInt : 0;
  const sliderMax = Math.max(50, (baselineInt ?? 10) * 4);

  // 전기 슬라이더 범위: 0 ~ max(500, 평균 × 5)
  const elecMax = Math.max(500, Math.ceil(current.electricity_kwh * 5));
  const elecVal = elecOverride ?? current.electricity_kwh;

  // 가스 슬라이더 범위: 0 ~ max(50, 평균 × 5)
  const gasMax = Math.max(50, Math.ceil(current.gas_m3 * 5));
  const gasVal = gasOverride ?? current.gas_m3;

  return (
    <div className="space-y-4">
      <section className="rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-900 ring-1 ring-amber-200">
        실제 데이터를 기반으로 변수를 바꿔보세요. 상주인구·전기·가스를 직접 조정해
        예상 탄소배출량 변화를 확인할 수 있습니다.
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">현재 상태</h3>
        <dl className="grid grid-cols-3 gap-y-1 text-xs">
          <dt className="text-slate-500">주용도</dt>
          <dd className="col-span-2">{currentLabel}</dd>
          <dt className="text-slate-500">전기/월</dt>
          <dd className="col-span-2">{nf(current.electricity_kwh)} kWh</dd>
          <dt className="text-slate-500">가스/월</dt>
          <dd className="col-span-2">{nf(current.gas_m3)} m³</dd>
          <dt className="text-slate-500">CO₂/월</dt>
          <dd className="col-span-2 font-semibold">{nf(current.co2_kg_month)} kg</dd>
          <dt className="text-slate-500">추정 상주인구</dt>
          <dd className="col-span-2">{baselineInt != null ? `약 ${ni(baselineInt)}명` : '계산 중…'}</dd>
        </dl>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">변경할 변수</h3>

        <label className="block text-xs">
          건물 주용도
          <select
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            value={sim.use_main_code}
            onChange={(e) => setSim('use_main_code', e.target.value)}
          >
            <option value="">— 선택 —</option>
            {USE_MAIN_CODES.map((u) => (
              <option key={u.code} value={u.code}>
                {u.ko} ({u.code})
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          토지용도
          <select
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            value={sim.land_use_category}
            onChange={(e) => setSim('land_use_category', e.target.value)}
          >
            {LAND_USE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.ko}
              </option>
            ))}
          </select>
        </label>

        {/* 상주인구 슬라이더 */}
        <label className="block text-xs">
          상주인구: <strong>{ni(targetInt)}명</strong>
          {baselineInt != null && (
            <span className="ml-2 text-slate-500">
              ({popDelta >= 0 ? '+' : ''}
              {ni(popDelta)}명 vs 현재 {ni(baselineInt)})
            </span>
          )}
          <input
            type="range"
            min={0}
            max={sliderMax}
            step={1}
            className="mt-1 w-full"
            disabled={baselineInt == null}
            value={targetInt}
            onChange={(e) => setPopTarget(Number(e.target.value))}
          />
          {baselineInt != null && (
            <button
              type="button"
              onClick={() => setPopTarget(baselineInt)}
              className="mt-1 text-[10px] text-slate-500 underline"
            >
              현재 값으로 재설정
            </button>
          )}
        </label>

        {/* 전기 슬라이더 */}
        <div className="block text-xs">
          <div className="flex items-center justify-between">
            <span>
              전기 사용량: <strong>{nf(elecVal)} kWh/월</strong>
              {elecOverride == null && (
                <span className="ml-1 text-slate-400">(인구 기반 자동)</span>
              )}
            </span>
            {elecOverride != null && (
              <button
                type="button"
                onClick={() => setElecOverride(null)}
                className="text-[10px] text-slate-500 underline"
              >
                자동으로 되돌리기
              </button>
            )}
          </div>
          <input
            type="range"
            min={0}
            max={elecMax}
            step={Math.max(1, Math.round(elecMax / 200))}
            className="mt-1 w-full"
            value={Math.round(elecVal)}
            onChange={(e) => setElecOverride(Number(e.target.value))}
          />
        </div>

        {/* 가스 슬라이더 */}
        <div className="block text-xs">
          <div className="flex items-center justify-between">
            <span>
              가스 사용량: <strong>{nf(gasVal)} m³/월</strong>
              {gasOverride == null && (
                <span className="ml-1 text-slate-400">(인구 기반 자동)</span>
              )}
            </span>
            {gasOverride != null && (
              <button
                type="button"
                onClick={() => setGasOverride(null)}
                className="text-[10px] text-slate-500 underline"
              >
                자동으로 되돌리기
              </button>
            )}
          </div>
          <input
            type="range"
            min={0}
            max={gasMax}
            step={Math.max(1, Math.round(gasMax / 200))}
            className="mt-1 w-full"
            value={Math.round(gasVal)}
            onChange={(e) => setGasOverride(Number(e.target.value))}
          />
        </div>
      </section>

      {/* 업종 배출 계수 배지 */}
      {result?.industry_multiplier != null && (
        <section className="rounded-md bg-orange-50 px-3 py-2 text-[11px] text-orange-900 ring-1 ring-orange-200">
          🏭 <strong>{result.industry_label}</strong> 업종 배출 계수{' '}
          <strong>{result.industry_multiplier}배</strong> 적용됨
          <span className="ml-1 text-orange-600">(공정 배출 + 에너지 집약도)</span>
        </section>
      )}

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">예상 결과</h3>
        <div className="grid grid-cols-2 gap-2 rounded bg-slate-50 p-3">
          <div>
            <div className="text-[10px] text-slate-500">현재 CO₂</div>
            <div className="text-base font-semibold">{nf(current.co2_kg_month)} kg</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500">시뮬 CO₂</div>
            <div className="text-base font-semibold">{result ? nf(result.co2_pred) : '—'} kg</div>
          </div>
          <div className="col-span-2 border-t border-slate-200 pt-2">
            <span className="text-[10px] text-slate-500">변화</span>
            <span className={`ml-2 text-lg font-bold ${color}`}>
              {sign}
              {result ? ni(delta) : '—'} kg/월
            </span>
          </div>
        </div>
        {loading && <p className="mt-1 text-[10px] text-slate-400">계산 중…</p>}
        {result?.warnings?.map((w) => (
          <p key={w} className="mt-1 text-[10px] text-amber-700">⚠ {w}</p>
        ))}
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">에너지 비교</h3>
        <SimulationChart current={current} sim={result?.breakdown} />
      </section>
    </div>
  );
}
