'use client';

import useSWR from 'swr';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store';
import { ActionRecommender } from './ActionRecommender';
import { SimulationTab } from './SimulationTab';
import { categoryForUseCode, labelForUseCode } from '@/lib/use-codes';
import { resolveBuildingHeight } from '@/lib/building-metrics';
import { EMISSION_FACTORS, totalCo2 } from '@/lib/emission-factors';
import { getIndustryMultiplier } from '@/lib/industry-factors';
import type { ReportResponse } from '@/lib/zod-schemas';

const EnergyChart = dynamic(() => import('./EnergyChart').then((m) => m.EnergyChart), {
  ssr: false,
  loading: () => <div className="h-40 w-full animate-pulse rounded bg-slate-100" />,
});

type EnergyRow = { yyyymm: string; electricity_kwh: number; gas_m3: number; co2_kg: number };
type Business = { shop_id: string; name: string; industry_code: string; industry_name: string };
type Factory = { factory_id: string; name: string; industry_code: string; industry_name: string; employees: number };
type BuildingDetail = {
  building?: Record<string, unknown>;
  energy?: EnergyRow[];
  businesses?: Business[];
  factories?: Factory[];
  error?: string;
};

async function fetcher(url: string): Promise<BuildingDetail> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`http_${r.status}`);
  return (await r.json()) as BuildingDetail;
}

function nf(n: number | undefined | null, suffix = ''): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + suffix;
}

function ni(n: number | undefined | null, suffix = ''): string {
  if (n == null || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString('ko-KR') + suffix;
}

function krw(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  if (n >= 100_000_000) return `${(n / 100_000_000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억원`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString('ko-KR')}만원`;
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

function average(rows: EnergyRow[], key: keyof EnergyRow): number {
  if (!rows.length) return 0;
  const sum = rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
  return sum / rows.length;
}

function industryPrefix(code?: string | null): string | null {
  if (!code) return null;
  const digits = code.replace(/^[A-Za-z]+/, '').replace(/\D/g, '');
  return digits.slice(0, 2) || null;
}

function shortId(id: string | undefined | null): string {
  if (!id) return '—';
  const s = String(id);
  if (s.length <= 12) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export function BuildingPanel() {
  const selected = useAppStore((s) => s.selected);
  const setSelected = useAppStore((s) => s.setSelected);
  const tab = useAppStore((s) => s.panelTab);
  const setPanelTab = useAppStore((s) => s.setPanelTab);
  const resetSim = useAppStore((s) => s.resetSim);

  const { data, error, isLoading } = useSWR(
    selected ? `/api/aggregate?building_id=${encodeURIComponent(selected.building_id)}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const b = useMemo(
    () => ((data?.building as Record<string, unknown>) ?? selected ?? {}) as Record<string, unknown>,
    [data, selected]
  );

  // Sync simulator defaults each time a new building loads
  useEffect(() => {
    if (!selected) return;
    if (!data?.building) return;
    // reason: fall back to 제2종근린생활시설 when the source data has no
    // use_main_code — otherwise the simulator silently never fires.
    const code = ((b.use_main_code as string | undefined) || '').trim() || '04000';
    resetSim(
      {
        use_main_code: code,
        land_use_category: categoryForUseCode(code),
        pop_delta_pct: 0,
      },
      selected.building_id
    );
    // reason: only re-sync when the selection identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.building_id, data?.building]);

  if (!selected) return null;

  const addressJibun = (b.address_jibun as string) || '';
  const addressRoad = (b.address_road as string) || '';
  const primaryAddress = addressRoad || addressJibun || '주소 미상';
  const secondaryAddress = addressRoad && addressJibun ? `지번: ${addressJibun}` : '';
  const useMain =
    (b.use_main as string) || labelForUseCode((b.use_main_code as string | undefined) ?? null);
  const buildingName = (b.name as string) || data?.businesses?.[0]?.name || '';

  return (
    <aside className="absolute right-4 top-4 bottom-4 z-10 flex w-[380px] flex-col rounded-lg bg-white p-4 shadow-2xl ring-1 ring-black/10 overflow-hidden">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold leading-tight" title={String(buildingName || primaryAddress)}>
            {buildingName || primaryAddress}
          </h2>
          {buildingName && (
            <p className="truncate text-xs text-slate-600" title={primaryAddress}>
              {primaryAddress}
            </p>
          )}
          {secondaryAddress && (
            <p className="truncate text-[11px] text-slate-500" title={secondaryAddress}>
              {secondaryAddress}
            </p>
          )}
        </div>
        <button
          onClick={() => setSelected(null)}
          className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          aria-label="닫기"
        >
          ✕
        </button>
      </header>

      <nav className="mt-3 flex gap-1 rounded-md bg-slate-100 p-1 text-sm" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'data'}
          onClick={() => setPanelTab('data')}
          className={`flex-1 rounded px-3 py-1 transition ${
            tab === 'data' ? 'bg-white shadow font-semibold text-slate-900' : 'text-slate-600'
          }`}
        >
          실측 정보
        </button>
        <button
          role="tab"
          aria-selected={tab === 'simulation'}
          onClick={() => setPanelTab('simulation')}
          className={`flex-1 rounded px-3 py-1 transition ${
            tab === 'simulation' ? 'bg-white shadow font-semibold text-slate-900' : 'text-slate-600'
          }`}
        >
          시뮬레이션
        </button>
      </nav>

      <div className="mt-3 flex-1 overflow-auto pr-1">
        {error && <p className="text-sm text-red-600">불러오기 실패</p>}
        {isLoading && !data && <p className="text-sm text-slate-500">불러오는 중…</p>}

        {tab === 'data' && (
          <DataTab
            buildingId={selected.building_id}
            building={b}
            useMain={useMain}
            energy={data?.energy ?? []}
            businesses={data?.businesses ?? []}
            factories={data?.factories ?? []}
            nf={nf}
            shortId={shortId}
          />
        )}

        {tab === 'simulation' && (
          <SimulationTab
            buildingId={selected.building_id}
            currentBuilding={b}
            energy={data?.energy ?? []}
            industryCode={
              data?.factories?.[0]?.industry_code ??
              data?.businesses?.[0]?.industry_code ??
              null
            }
          />
        )}
      </div>
    </aside>
  );
}

function DataTab({
  buildingId,
  building,
  useMain,
  energy,
  businesses,
  factories,
  nf,
  shortId,
}: {
  buildingId: string;
  building: Record<string, unknown>;
  useMain: string;
  energy: EnergyRow[];
  businesses: Business[];
  factories: Factory[];
  nf: (n: number | undefined | null, suffix?: string) => string;
  shortId: (s: string | undefined | null) => string;
}) {
  const [showMore, setShowMore] = useState(false);
  const [showCarbonAdjustment, setShowCarbonAdjustment] = useState(false);
  const useMainCode = building.use_main_code as string | undefined;
  const industryCode = factories[0]?.industry_code ?? businesses[0]?.industry_code ?? null;
  const industry =
    factories[0]?.industry_name ?? businesses[0]?.industry_name ?? null;

  const approvedAt = building.approved_at as string | undefined | null;
  const height = resolveBuildingHeight(building.height_m, building.floors_above);
  const popPred = building.population_pred as number | undefined | null;
  const addressJibun = building.address_jibun as string | undefined | null;
  const industryMultiplier = getIndustryMultiplier(industryCode);
  const avgElectricity = average(energy, 'electricity_kwh');
  const avgGas = average(energy, 'gas_m3');
  const baseCo2 = totalCo2({ electricity_kwh: avgElectricity, gas_m3: avgGas });
  const adjustedCo2 = baseCo2 * industryMultiplier.multiplier;
  const prefix = industryPrefix(industryCode);

  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">속성</h3>
        <dl className="grid grid-cols-3 gap-y-1 text-sm">
          <dt className="text-slate-500">주용도</dt>
          <dd className="col-span-2">{useMain}</dd>
          <dt className="text-slate-500">업종</dt>
          <dd className="col-span-2">{industry ?? '데이터 없음'}</dd>
          <dt className="text-slate-500">상주인구(예측)</dt>
          <dd className="col-span-2">{popPred != null ? `약 ${ni(Number(popPred), '명')}` : '—'}</dd>
          <dt className="text-slate-500">연면적</dt>
          <dd className="col-span-2">{nf(building.area_total as number, ' ㎡')}</dd>
          <dt className="text-slate-500">건축면적</dt>
          <dd className="col-span-2">{nf(building.area_building as number, ' ㎡')}</dd>
          <dt className="text-slate-500">층수</dt>
          <dd className="col-span-2">
            지상 {nf(building.floors_above as number)} · 지하 {nf(building.floors_below as number)}
          </dd>

          {/* 더보기 — 준공일, 높이, 지번주소 */}
          {showMore && (
            <>
              <dt className="text-slate-500">준공일</dt>
              <dd className="col-span-2">{approvedAt ?? '—'}</dd>
              <dt className="text-slate-500">높이</dt>
              <dd className="col-span-2">
                {nf(height.value, ' m')}
                {height.estimated && <span className="ml-1 text-[11px] text-slate-500">(층수 기반 추정)</span>}
              </dd>
              <dt className="text-slate-500">지번주소</dt>
              <dd className="col-span-2 break-all text-xs">{addressJibun ?? '—'}</dd>
            </>
          )}
        </dl>
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="mt-2 text-[11px] text-slate-500 underline"
        >
          {showMore ? '접기' : '…더보기'}
        </button>
      </section>

      <section>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">탄소배출 (최근)</h3>
          <button
            type="button"
            onClick={() => setShowCarbonAdjustment((v) => !v)}
            className="rounded border border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"
            aria-expanded={showCarbonAdjustment}
          >
            업종 보정
          </button>
        </div>
        <p className="text-2xl font-bold">{nf(building.co2_kg_month as number, ' kg/월')}</p>
        {showCarbonAdjustment && (
          <div className="mt-2 rounded-md bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-600 ring-1 ring-slate-200">
            <p>
              {industryMultiplier.multiplier === 1
                ? '업종 보정 없음: 일반 업종 승수 1.0배를 적용합니다.'
                : `${industryMultiplier.label} 보정: KSIC ${prefix ?? '미상'} 대분류 승수 ${industryMultiplier.multiplier}배를 적용합니다.`}
            </p>
            <p className="mt-1">
              산식: 전기 {EMISSION_FACTORS.electricity.factor} kg/kWh × {nf(avgElectricity)} kWh + 가스{' '}
              {EMISSION_FACTORS.gas_lng.factor} kg/m³ × {nf(avgGas)} m³ = {nf(baseCo2)} kg/월
            </p>
            <p className="mt-1">
              업종 보정값: {nf(baseCo2)} × {industryMultiplier.multiplier} = {nf(adjustedCo2)} kg/월
            </p>
          </div>
        )}
      </section>

      {energy.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">월별 에너지</h3>
          <EnergyChart data={energy.slice().reverse()} />
        </section>
      )}

      {businesses.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            상호 ({businesses.length})
          </h3>
          <ul className="max-h-40 space-y-1 overflow-auto text-sm">
            {businesses.slice(0, 12).map((s) => (
              <li key={s.shop_id} className="flex items-baseline justify-between gap-2">
                <span className="truncate">{s.name}</span>
                <span className="shrink-0 text-[10px] text-slate-500">{s.industry_name}</span>
              </li>
            ))}
            {businesses.length > 12 && (
              <li className="text-[11px] text-slate-500">… 외 {businesses.length - 12}개</li>
            )}
          </ul>
        </section>
      )}

      {factories.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            공장 ({factories.length})
          </h3>
          <ul className="space-y-1 text-sm">
            {factories.slice(0, 6).map((f) => (
              <li key={f.factory_id} className="flex items-baseline justify-between gap-2">
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-[10px] text-slate-500">
                  {f.industry_name} · {f.employees}명
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ActionRecommender useMainCode={useMainCode ?? null} industryCode={industryCode} />

      <AiReportSection buildingId={buildingId} />

      <footer className="border-t border-slate-200 pt-2 text-[10px] text-slate-400">
        ID {shortId(building.building_id as string)} · PNU {shortId(building.pnu as string)} ·
        {' '}데이터는 추정치, 정성적 비교용
      </footer>
    </div>
  );
}

function AiReportSection({ buildingId }: { buildingId: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus('idle');
    setReport(null);
    setError(null);
  }, [buildingId]);

  async function loadReport() {
    setStatus('loading');
    setError(null);
    try {
      const r = await fetch(`/api/report?building_id=${encodeURIComponent(buildingId)}`);
      const payload = (await r.json().catch(() => null)) as unknown;
      if (!r.ok) {
        const reason =
          payload && typeof payload === 'object' && 'reason' in payload
            ? String((payload as { reason?: unknown }).reason)
            : '';
        if (reason === 'missing_openai_api_key') {
          throw new Error('서버 API 키 미설정');
        }
        throw new Error('보고서 생성 실패');
      }
      setReport(payload as ReportResponse);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : '보고서 생성 실패');
      setStatus('error');
    }
  }

  return (
    <section className="border-t border-slate-200 pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">AI 요약 보고서</h3>
        <button
          type="button"
          onClick={loadReport}
          disabled={status === 'loading'}
          className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'loading' ? '생성 중' : report ? '다시 생성' : '생성'}
        </button>
      </div>

      {status === 'error' && <p className="text-xs text-red-600">{error}</p>}

      {report && (
        <div className="space-y-3 text-xs text-slate-700">
          <p className="leading-relaxed text-slate-800">{report.summary}</p>

          <div>
            <h4 className="mb-1 font-semibold text-slate-600">업종 기반 판단</h4>
            <ul className="list-disc space-y-1 pl-4">
              {report.industry_reasoning.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-1 font-semibold text-slate-600">우선 액션</h4>
            <ul className="space-y-2">
              {report.priority_actions.map((action) => (
                <li key={`${action.title}-${action.why_priority}`} className="border-l-2 border-emerald-400 pl-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <strong className="text-slate-800">{action.title}</strong>
                    {action.estimated_saving_pct != null && (
                      <span className="shrink-0 text-[10px] text-emerald-700">
                        ~{action.estimated_saving_pct}%
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-slate-600">{action.why_priority}</p>
                  <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                    <dt>월 비용절감</dt>
                    <dd className="text-right text-slate-700">{krw(action.estimated_monthly_cost_saving_krw)}</dd>
                    <dt>월 탄소절감</dt>
                    <dd className="text-right text-slate-700">{ni(action.estimated_monthly_co2_saving_kg, ' kg')}</dd>
                    <dt>투자비</dt>
                    <dd className="text-right text-slate-700">
                      {action.investment_range_krw
                        ? `${krw(action.investment_range_krw[0])}~${krw(action.investment_range_krw[1])}`
                        : '—'}
                    </dd>
                    <dt>BEP</dt>
                    <dd className="text-right text-slate-700">
                      {action.bep_months_range
                        ? `${action.bep_months_range[0]}~${action.bep_months_range[1]}개월`
                        : '—'}
                    </dd>
                  </dl>
                </li>
              ))}
            </ul>
          </div>

          <ul className="list-disc space-y-1 pl-4 text-[11px] text-slate-500">
            {report.caveats.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
