'use client';

import useSWR from 'swr';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store';
import { ActionRecommender } from './ActionRecommender';
import { SimulationTab } from './SimulationTab';
import { categoryForUseCode, labelForUseCode } from '@/lib/use-codes';
import { resolveBuildingHeight } from '@/lib/building-metrics';
import { EMISSION_FACTORS, electricityKwhFromCo2, totalCo2 } from '@/lib/emission-factors';
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

// CO₂ 분위(1-5) → 색상 토큰 매핑
const QUINTILE_COLORS: Record<number, { bar: string; border: string; text: string; badge: string }> = {
  1: { bar: 'bg-emerald-500', border: 'border-emerald-400', text: 'text-emerald-700', badge: 'bg-emerald-50 text-emerald-700' },
  2: { bar: 'bg-lime-500',    border: 'border-lime-400',    text: 'text-lime-700',    badge: 'bg-lime-50 text-lime-700' },
  3: { bar: 'bg-yellow-400',  border: 'border-yellow-400',  text: 'text-yellow-700',  badge: 'bg-yellow-50 text-yellow-700' },
  4: { bar: 'bg-orange-500',  border: 'border-orange-400',  text: 'text-orange-700',  badge: 'bg-orange-50 text-orange-700' },
  5: { bar: 'bg-red-500',     border: 'border-red-400',     text: 'text-red-700',     badge: 'bg-red-50 text-red-700' },
};
const DEFAULT_Q_COLOR = { bar: 'bg-slate-300', border: 'border-slate-300', text: 'text-slate-800', badge: 'bg-slate-100 text-slate-500' };

function quintileLabel(q: number | null | undefined): string {
  if (!q) return '—';
  return ['최저', '낮음', '중간', '높음', '최고'][q - 1] ?? '—';
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

  useEffect(() => {
    if (!selected) return;
    if (!data?.building) return;
    // reason: fall back to 제2종근린생활시설 when the source data has no
    // use_main_code — otherwise the simulator silently never fires.
    const code = ((b.use_main_code as string | undefined) || '').trim() || '04000';
    resetSim(
      { use_main_code: code, land_use_category: categoryForUseCode(code), pop_delta_pct: 0 },
      selected.building_id
    );
    // reason: only re-sync when the selection identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.building_id, data?.building]);

  if (!selected) return null;

  const addressRoad = (b.address_road as string) || '';
  const addressJibun = (b.address_jibun as string) || '';
  const primaryAddress = addressRoad || addressJibun || '주소 미상';
  const secondaryAddress = addressRoad && addressJibun ? `지번: ${addressJibun}` : '';
  const useMain = (b.use_main as string) || labelForUseCode((b.use_main_code as string | undefined) ?? null);
  const buildingName = (b.name as string) || data?.businesses?.[0]?.name || '';
  const co2Quintile = (b.co2_quintile as number | null | undefined) ?? selected.co2_quintile;
  const qc = QUINTILE_COLORS[co2Quintile ?? 0] ?? DEFAULT_Q_COLOR;

  return (
    <aside className="absolute right-4 top-4 bottom-4 z-10 flex w-[380px] flex-col rounded-xl bg-white shadow-2xl ring-1 ring-black/10 overflow-hidden">
      {/* 분위 색상 상단 바 */}
      <div className={`h-1 w-full shrink-0 ${qc.bar}`} />

      <div className="flex flex-1 flex-col overflow-hidden px-4 pb-4 pt-3">
        {/* 헤더 */}
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2
              className="truncate text-[15px] font-bold leading-tight text-slate-900"
              title={String(buildingName || primaryAddress)}
            >
              {buildingName || primaryAddress}
            </h2>
            {buildingName && (
              <p className="truncate text-xs text-slate-500" title={primaryAddress}>
                {primaryAddress}
              </p>
            )}
            {secondaryAddress && (
              <p className="truncate text-[10px] text-slate-400" title={secondaryAddress}>
                {secondaryAddress}
              </p>
            )}
            {useMain && (
              <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                {useMain}
              </span>
            )}
          </div>
          <button
            onClick={() => setSelected(null)}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            ✕
          </button>
        </header>

        {/* 탭 */}
        <nav className="mt-3 flex gap-1 rounded-2xl bg-slate-100/80 p-1.5 text-[13px]" role="tablist">
          {(['data', 'simulation', 'report'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setPanelTab(t)}
              className={`flex-1 rounded-xl py-1.5 font-medium transition-all duration-200 ${
                tab === t
                  ? 'bg-white shadow-sm ring-1 ring-black/5 text-slate-900'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {t === 'data' ? '실측 정보' : t === 'simulation' ? '시뮬레이터' : 'AI 보고서'}
            </button>
          ))}
        </nav>

        {/* 탭 콘텐츠 */}
        <div className="mt-3 flex-1 overflow-auto pr-0.5">
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">불러오기 실패</p>
          )}
          {isLoading && !data && (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          )}

          {tab === 'data' && (
            <DataTab
              buildingId={selected.building_id}
              building={b}
              useMain={useMain}
              energy={data?.energy ?? []}
              businesses={data?.businesses ?? []}
              factories={data?.factories ?? []}
              co2Quintile={co2Quintile}
              qc={qc}
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

          {tab === 'report' && (
            <AiReportSection buildingId={selected.building_id} />
          )}
        </div>
      </div>
    </aside>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
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

function DataTab({
  buildingId,
  building,
  useMain,
  energy,
  businesses,
  factories,
  co2Quintile,
  qc,
  nf,
  shortId,
}: {
  buildingId: string;
  building: Record<string, unknown>;
  useMain: string;
  energy: EnergyRow[];
  businesses: Business[];
  factories: Factory[];
  co2Quintile: number | null | undefined;
  qc: typeof DEFAULT_Q_COLOR;
  nf: (n: number | undefined | null, suffix?: string) => string;
  shortId: (s: string | undefined | null) => string;
}) {
  const [showMore, setShowMore] = useState(false);
  const [showCarbonAdjustment, setShowCarbonAdjustment] = useState(false);
  const useMainCode = building.use_main_code as string | undefined;
  const industryCode = factories[0]?.industry_code ?? businesses[0]?.industry_code ?? null;
  const industry = factories[0]?.industry_name ?? businesses[0]?.industry_name ?? null;

  const approvedAt = building.approved_at as string | undefined | null;
  const height = resolveBuildingHeight(building.height_m, building.floors_above);
  const popPred = building.population_pred as number | undefined | null;
  const addressJibun = building.address_jibun as string | undefined | null;
  const industryMultiplier = getIndustryMultiplier(industryCode);
  const avgElectricity = average(energy, 'electricity_kwh');
  const avgGas = average(energy, 'gas_m3');
  const currentCo2 = Number(building.co2_kg_month) || 0;
  const measuredBaseCo2 = totalCo2({ electricity_kwh: avgElectricity, gas_m3: avgGas });
  const hasMeasuredEnergy = avgElectricity > 0 || avgGas > 0;
  const baseCo2 = hasMeasuredEnergy ? measuredBaseCo2 : currentCo2 / Math.max(1, industryMultiplier.multiplier);
  const formulaElectricity = hasMeasuredEnergy ? avgElectricity : electricityKwhFromCo2(baseCo2);
  const formulaGas = hasMeasuredEnergy ? avgGas : 0;
  const adjustedCo2 = hasMeasuredEnergy ? baseCo2 * industryMultiplier.multiplier : currentCo2;
  const prefix = industryPrefix(industryCode);

  return (
    <div className="divide-y divide-slate-100">

      {/* ── 탄소배출 카드 ── */}
      <div className="pb-4">
        <SectionHeader>탄소배출</SectionHeader>
        <div className={`rounded-xl border-l-4 ${qc.border} bg-slate-50 px-3 py-3`}>
          <p className="mb-1 text-xs text-slate-500">추정 배출량</p>
          <div className="flex items-end justify-between gap-2">
            <p className={`text-3xl font-bold leading-none tracking-tight ${qc.text}`}>
              {nf(building.co2_kg_month as number)}
              <span className="ml-1.5 text-sm font-normal text-slate-400">kg</span>
            </p>
            {co2Quintile && (
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${qc.badge}`}>
                {quintileLabel(co2Quintile)} ({co2Quintile}/5)
              </span>
            )}
          </div>

          {/* 업종 보정 토글 */}
          <button
            type="button"
            onClick={() => setShowCarbonAdjustment((v) => !v)}
            className="mt-3 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
          >
            <span>{showCarbonAdjustment ? '▲' : '▼'}</span>
            업종 보정 계산 {showCarbonAdjustment ? '숨기기' : '보기'}
          </button>
          {showCarbonAdjustment && (
            <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-xs leading-relaxed text-slate-600">
              <p>
                {industryMultiplier.multiplier === 1
                  ? '업종 보정 없음 (승수 1.0배)'
                  : `${industryMultiplier.label} · KSIC ${prefix ?? '미상'} 대분류 ×${industryMultiplier.multiplier}`}
              </p>
              <p>
                전기 {EMISSION_FACTORS.electricity.factor} × {nf(formulaElectricity)} kWh
                {' '}+ 가스 {EMISSION_FACTORS.gas_lng.factor} × {nf(formulaGas)} m³
                {' '}= {nf(baseCo2)} kg
              </p>
              <p className="font-medium text-slate-700">
                보정 후: {nf(baseCo2)} × {industryMultiplier.multiplier} = {nf(adjustedCo2)} kg/월
              </p>
              {!hasMeasuredEnergy && (
                <p className="text-slate-400">※ 원자료 없음 — CO₂ 역산 추정값</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 월별 에너지 ── */}
      {energy.length > 0 && (
        <div className="py-5">
          <SectionHeader>월별 에너지 추이</SectionHeader>
          <EnergyChart data={energy.slice().reverse()} />
        </div>
      )}

      {/* ── 건물 정보 ── */}
      <div className="py-5">
        <SectionHeader>건물 정보</SectionHeader>
        <div className="divide-y divide-slate-50">
          <InfoRow label="주용도" value={useMain} />
          <InfoRow label="업종" value={industry ?? '데이터 없음'} />
          <InfoRow label="연면적" value={nf(building.area_total as number, ' ㎡')} />
          <InfoRow
            label="층수"
            value={`지상 ${nf(building.floors_above as number)}층 · 지하 ${nf(building.floors_below as number)}층`}
          />
          <InfoRow
            label="상주인구 (예측)"
            value={popPred != null ? `약 ${ni(Number(popPred), '명')}`  : '—'}
          />
          {showMore && (
            <>
              <InfoRow label="준공일" value={approvedAt ?? '—'} />
              <InfoRow
                label="높이"
                value={
                  <>
                    {nf(height.value, ' m')}
                    {height.estimated && <span className="ml-1 text-xs text-slate-400">(추정)</span>}
                  </>
                }
              />
              <div className="py-2">
                <p className="mb-0.5 text-sm text-slate-400">지번주소</p>
                <p className="break-all text-sm font-medium text-slate-800">{addressJibun ?? '—'}</p>
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="mt-1 text-xs text-slate-400 underline hover:text-slate-600"
        >
          {showMore ? '접기' : '준공일·높이·지번 더보기'}
        </button>
      </div>

      {/* ── 입주 상호 ── */}
      {businesses.length > 0 && (
        <div className="py-5">
          <SectionHeader>입주 상호 ({businesses.length})</SectionHeader>
          <div className="flex flex-wrap gap-1.5">
            {businesses.slice(0, 12).map((s) => (
              <span
                key={s.shop_id}
                title={s.industry_name}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
              >
                {s.name}
              </span>
            ))}
            {businesses.length > 12 && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-400">
                +{businesses.length - 12}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── 공장 ── */}
      {factories.length > 0 && (
        <div className="py-5">
          <SectionHeader>공장 ({factories.length})</SectionHeader>
          <div className="space-y-2">
            {factories.slice(0, 6).map((f) => (
              <div key={f.factory_id} className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-slate-800">{f.name}</span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">
                  {f.employees}명
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 탄소절감 추천 ── */}
      <div className="py-5">
        <ActionRecommender useMainCode={useMainCode ?? null} industryCode={industryCode} />
      </div>

      {/* ── 푸터 ── */}
      <div className="pt-3 text-xs text-slate-400">
        ID {shortId(building.building_id as string)} · PNU {shortId(building.pnu as string)} · 추정치
      </div>
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
        if (reason === 'missing_openai_api_key') throw new Error('서버 API 키 미설정');
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
    <div className="divide-y divide-slate-100">

      {/* ── CTA ── */}
      <div className="pb-4">
        <p className="mb-3 text-sm leading-relaxed text-slate-500">
          이 건물의 탄소배출 원인과 절감 액션을 AI가 분석합니다.
        </p>
        <button
          type="button"
          onClick={loadReport}
          disabled={status === 'loading'}
          className="w-full rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'loading' ? '생성 중…' : report ? '재생성' : '보고서 생성'}
        </button>
        {status === 'loading' && (
          <div className="mt-3 space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-3 animate-pulse rounded-full bg-slate-100" />
            ))}
          </div>
        )}
        {status === 'error' && (
          <div className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-600">{error}</div>
        )}
      </div>

      {report && (
        <>
          {/* ── 요약 ── */}
          <div className="py-4">
            <SectionHeader>요약</SectionHeader>
            <p className="text-sm leading-relaxed text-slate-700">{report.summary}</p>
          </div>

          {/* ── 업종 기반 판단 ── */}
          <div className="py-4">
            <SectionHeader>업종 기반 판단</SectionHeader>
            <ul className="space-y-2">
              {report.industry_reasoning.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 shrink-0 text-slate-300">·</span>
                  <span className="text-sm text-slate-700">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── 우선 액션 ── */}
          <div className="py-4">
            <SectionHeader>우선 액션</SectionHeader>
            <ul className="space-y-3">
              {report.priority_actions.map((action) => (
                <li key={`${action.title}-${action.why_priority}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <strong className="text-sm font-semibold text-slate-900">{action.title}</strong>
                    {action.estimated_saving_pct != null && (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                        ~{action.estimated_saving_pct}%
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-slate-500">{action.why_priority}</p>
                  <div className="mt-2 divide-y divide-slate-100 border-t border-slate-200 pt-1">
                    <InfoRow label="월 비용절감" value={krw(action.estimated_monthly_cost_saving_krw)} />
                    <InfoRow label="월 탄소절감" value={ni(action.estimated_monthly_co2_saving_kg, ' kg')} />
                    <InfoRow
                      label="투자비"
                      value={
                        action.investment_range_krw
                          ? `${krw(action.investment_range_krw[0])}~${krw(action.investment_range_krw[1])}`
                          : '—'
                      }
                    />
                    <InfoRow
                      label="BEP"
                      value={
                        action.bep_months_range
                          ? `${action.bep_months_range[0]}~${action.bep_months_range[1]}개월`
                          : '—'
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* ── 주의사항 ── */}
          <div className="py-4">
            <SectionHeader>주의사항</SectionHeader>
            <ul className="space-y-1.5">
              {report.caveats.map((item) => (
                <li key={item} className="flex gap-2 text-xs text-slate-400">
                  <span className="shrink-0">※</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
