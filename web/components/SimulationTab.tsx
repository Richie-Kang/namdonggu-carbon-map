'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAppStore } from '@/store';
import { USE_MAIN_CODES, LAND_USE_CATEGORIES, labelForUseCode } from '@/lib/use-codes';
import { electricityKwhFromCo2 } from '@/lib/emission-factors';
import {
  applyUsageDelta,
  formatUsageForUnit,
  unitSuffix,
  type UsageUnit,
} from '@/lib/simulation-utils';

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

function SecHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="h-4 w-1 rounded-full bg-slate-300" />
      <h3 className="text-sm font-semibold text-slate-600">{children}</h3>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="shrink-0 text-sm text-slate-400">{label}</span>
      <span className="text-right text-sm font-medium text-slate-800">{value}</span>
    </div>
  );
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
  const [modelEnergyBaseline, setModelEnergyBaseline] = useState<{
    electricity_kwh: number;
    gas_m3: number;
  } | null>(null);

  const [usageUnit, setUsageUnit] = useState<UsageUnit>('monthly');
  const [elecDeltaPct, setElecDeltaPct] = useState(0);
  const [gasDeltaPct, setGasDeltaPct] = useState(0);

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
    setModelEnergyBaseline(null);
    setUsageUnit('monthly');
    setElecDeltaPct(0);
    setGasDeltaPct(0);
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
            setModelEnergyBaseline((prev) => prev ?? data.breakdown);
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
    const fallbackElectricity = electricityKwhFromCo2(current.co2_kg_month);
    const baseElectricity = current.electricity_kwh > 0
      ? current.electricity_kwh
      : modelEnergyBaseline?.electricity_kwh ?? fallbackElectricity;
    const baseGas = current.gas_m3 > 0
      ? current.gas_m3
      : modelEnergyBaseline?.gas_m3 ?? 0;
    const hasElectricityBase = baseElectricity > 0;
    const hasGasBase = baseGas > 0;
    callPredict({
      use_main_code: useCode,
      land_use_category: landCat,
      target_population: popTarget ?? undefined,
      target_electricity_kwh: hasElectricityBase ? applyUsageDelta(baseElectricity, elecDeltaPct) : undefined,
      target_gas_m3: hasGasBase ? applyUsageDelta(baseGas, gasDeltaPct) : undefined,
      industry_code: industryCode ?? undefined,
    });
  }, [
    sim.use_main_code,
    sim.land_use_category,
    popTarget,
    elecDeltaPct,
    gasDeltaPct,
    industryCode,
    callPredict,
    currentBuilding.use_main_code,
    current.electricity_kwh,
    current.gas_m3,
    current.co2_kg_month,
    modelEnergyBaseline,
  ]);

  const delta = result ? result.co2_pred - current.co2_kg_month : 0;
  const sign = delta > 0 ? '+' : '';
  const color = delta > 0 ? 'text-red-600' : delta < 0 ? 'text-emerald-700' : 'text-slate-700';

  const currentLabel = labelForUseCode((currentBuilding.use_main_code as string) ?? null);
  const baselineInt = popBaseline ? Math.round(popBaseline) : null;
  const targetInt = popTarget ?? baselineInt ?? 0;
  const popDelta = baselineInt != null ? targetInt - baselineInt : 0;
  const sliderMax = Math.max(50, (baselineInt ?? 10) * 4);

  const fallbackElectricity = electricityKwhFromCo2(current.co2_kg_month);
  const baseElectricity = current.electricity_kwh > 0
    ? current.electricity_kwh
    : modelEnergyBaseline?.electricity_kwh ?? fallbackElectricity;
  const baseGas = current.gas_m3 > 0
    ? current.gas_m3
    : modelEnergyBaseline?.gas_m3 ?? 0;
  const effectiveCurrent = {
    electricity_kwh: baseElectricity,
    gas_m3: baseGas,
    co2_kg_month: current.co2_kg_month,
  };
  const usingCo2Fallback = current.electricity_kwh <= 0 && !modelEnergyBaseline && fallbackElectricity > 0;
  const elecVal = applyUsageDelta(baseElectricity, elecDeltaPct);
  const gasVal = applyUsageDelta(baseGas, gasDeltaPct);
  const displayPeriod = unitSuffix(usageUnit);
  const elecBaseDisplay = formatUsageForUnit(baseElectricity, usageUnit);
  const gasBaseDisplay = formatUsageForUnit(baseGas, usageUnit);
  const elecDisplay = formatUsageForUnit(elecVal, usageUnit);
  const gasDisplay = formatUsageForUnit(gasVal, usageUnit);

  const resultBorderColor = delta > 0 ? 'border-red-400' : delta < 0 ? 'border-emerald-400' : 'border-slate-300';
  const resultBadgeClass = delta > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700';

  return (
    <div className="divide-y divide-slate-100">

      {/* ── 안내 ── */}
      <div className="pb-4">
        <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800 ring-1 ring-amber-100">
          실제 데이터를 기반으로 변수를 바꿔보세요. 상주인구·전기·가스를 직접 조정해
          예상 탄소배출량 변화를 확인할 수 있습니다.
        </p>
      </div>

      {/* ── 현재 상태 ── */}
      <div className="py-4">
        <SecHeader>현재 상태</SecHeader>
        <div className="divide-y divide-slate-50">
          <InfoRow label="주용도" value={currentLabel} />
          <InfoRow
            label="전기/월"
            value={
              <>
                {nf(effectiveCurrent.electricity_kwh)} kWh
                {usingCo2Fallback && (
                  <span className="ml-1 text-[10px] text-slate-400">(CO₂ 환산)</span>
                )}
              </>
            }
          />
          <InfoRow label="가스/월" value={`${nf(effectiveCurrent.gas_m3)} m³`} />
          <InfoRow
            label="CO₂/월"
            value={<strong className="text-slate-900">{nf(current.co2_kg_month)} kg</strong>}
          />
          <InfoRow
            label="추정 상주인구"
            value={baselineInt != null ? `약 ${ni(baselineInt)}명` : '계산 중…'}
          />
        </div>
      </div>

      {/* ── 변수 조정 ── */}
      <div className="py-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-4 w-1 rounded-full bg-slate-300" />
            <h3 className="text-sm font-semibold text-slate-600">변수 조정</h3>
          </div>
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-[11px]" aria-label="사용량 표시 단위">
            <button
              type="button"
              onClick={() => setUsageUnit('monthly')}
              className={`rounded-md px-2.5 py-0.5 transition-all ${usageUnit === 'monthly' ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              월
            </button>
            <button
              type="button"
              onClick={() => setUsageUnit('annual')}
              className={`rounded-md px-2.5 py-0.5 transition-all ${usageUnit === 'annual' ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              연
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {/* 건물 주용도 */}
          <div>
            <p className="mb-1.5 text-sm text-slate-400">건물 주용도</p>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
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
          </div>

          {/* 토지용도 */}
          <div>
            <p className="mb-1.5 text-sm text-slate-400">토지용도</p>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
              value={sim.land_use_category}
              onChange={(e) => setSim('land_use_category', e.target.value)}
            >
              {LAND_USE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.ko}
                </option>
              ))}
            </select>
          </div>

          {/* 상주인구 슬라이더 */}
          <div className="rounded-xl bg-slate-50 px-3 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-slate-600">상주인구</span>
              <strong className="text-sm font-semibold text-slate-800">{ni(targetInt)}명</strong>
            </div>
            {baselineInt != null && (
              <p className="mt-0.5 text-[11px] text-slate-400">
                현재 {ni(baselineInt)}명 대비 {popDelta >= 0 ? '+' : ''}{ni(popDelta)}명
              </p>
            )}
            <input
              type="range"
              min={0}
              max={sliderMax}
              step={1}
              className="mt-2 w-full accent-slate-700"
              disabled={baselineInt == null}
              value={targetInt}
              onChange={(e) => setPopTarget(Number(e.target.value))}
            />
            {baselineInt != null && (
              <button
                type="button"
                onClick={() => setPopTarget(baselineInt)}
                className="mt-1.5 text-[11px] text-slate-400 underline hover:text-slate-600"
              >
                현재 값으로 재설정
              </button>
            )}
          </div>

          {/* 전기 슬라이더 */}
          <div className="rounded-xl bg-slate-50 px-3 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-slate-600">전기 사용량</span>
              <strong className="text-sm font-semibold text-slate-800">
                {nf(elecDisplay)} kWh/{displayPeriod}
              </strong>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">
              현재 {nf(elecBaseDisplay)} kWh/{displayPeriod} 기준
              ({elecDeltaPct >= 0 ? '+' : ''}{elecDeltaPct}%)
            </p>
            <input
              type="range"
              min={-100}
              max={300}
              step={5}
              className="mt-2 w-full accent-slate-700"
              value={elecDeltaPct}
              onChange={(e) => setElecDeltaPct(Number(e.target.value))}
            />
            <button
              type="button"
              onClick={() => setElecDeltaPct(0)}
              className="mt-1.5 text-[11px] text-slate-400 underline hover:text-slate-600"
            >
              현재 값으로 재설정
            </button>
          </div>

          {/* 가스 슬라이더 */}
          <div className="rounded-xl bg-slate-50 px-3 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-slate-600">가스 사용량</span>
              <strong className="text-sm font-semibold text-slate-800">
                {nf(gasDisplay)} m³/{displayPeriod}
              </strong>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">
              현재 {nf(gasBaseDisplay)} m³/{displayPeriod} 기준
              ({gasDeltaPct >= 0 ? '+' : ''}{gasDeltaPct}%)
            </p>
            <input
              type="range"
              min={-100}
              max={300}
              step={5}
              className="mt-2 w-full accent-slate-700"
              value={gasDeltaPct}
              onChange={(e) => setGasDeltaPct(Number(e.target.value))}
            />
            <button
              type="button"
              onClick={() => setGasDeltaPct(0)}
              className="mt-1.5 text-[11px] text-slate-400 underline hover:text-slate-600"
            >
              현재 값으로 재설정
            </button>
          </div>
        </div>
      </div>

      {/* ── 업종 배출 계수 ── */}
      {result?.industry_multiplier != null && (
        <div className="py-4">
          <div className="rounded-xl bg-orange-50 px-3 py-2.5 text-xs leading-relaxed text-orange-900 ring-1 ring-orange-100">
            <strong>{result.industry_label}</strong> 업종 배출 계수{' '}
            <strong>{result.industry_multiplier}배</strong> 적용됨 — KSIC 2자리 대분류 기준, 제조·에너지 집약 업종의 공정 배출과 에너지 집약도를 반영합니다.
          </div>
        </div>
      )}

      {/* ── 예상 결과 ── */}
      <div className="py-4">
        <SecHeader>예상 결과</SecHeader>
        <div className={`rounded-xl border-l-4 bg-slate-50 px-3 py-3 ${resultBorderColor}`}>
          <p className="text-xs text-slate-400">시뮬레이션 CO₂</p>
          <div className="mt-0.5 flex items-end justify-between gap-2">
            <p className="text-3xl font-bold leading-none tracking-tight text-slate-800">
              {result ? nf(result.co2_pred) : '—'}
              <span className="ml-1.5 text-sm font-normal text-slate-400">kg/월</span>
            </p>
            {result && (
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${resultBadgeClass}`}>
                {sign}{ni(delta)} kg
              </span>
            )}
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t border-slate-200 pt-2 text-sm">
            <span className="text-slate-400">현재 CO₂</span>
            <span className="font-medium text-slate-700">{nf(current.co2_kg_month)} kg/월</span>
          </div>
          {loading && <p className="mt-2 text-[11px] text-slate-400">계산 중…</p>}
        </div>
        {result?.warnings?.map((w) => (
          <p key={w} className="mt-2 text-[11px] text-amber-700">⚠ {w}</p>
        ))}
      </div>

      {/* ── 에너지 비교 ── */}
      <div className="py-4">
        <SecHeader>에너지 비교</SecHeader>
        <SimulationChart current={effectiveCurrent} sim={result?.breakdown} />
      </div>
    </div>
  );
}
