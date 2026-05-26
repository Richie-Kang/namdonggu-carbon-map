'use client';

import useSWR from 'swr';
import dynamic from 'next/dynamic';
import { useEffect, useMemo } from 'react';
import { useAppStore } from '@/store';
import { ActionRecommender } from './ActionRecommender';
import { SimulationTab } from './SimulationTab';
import { categoryForUseCode, labelForUseCode } from '@/lib/use-codes';

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
          />
        )}
      </div>
    </aside>
  );
}

function DataTab({
  building,
  useMain,
  energy,
  businesses,
  factories,
  nf,
  shortId,
}: {
  building: Record<string, unknown>;
  useMain: string;
  energy: EnergyRow[];
  businesses: Business[];
  factories: Factory[];
  nf: (n: number | undefined | null, suffix?: string) => string;
  shortId: (s: string | undefined | null) => string;
}) {
  const useMainCode = building.use_main_code as string | undefined;
  const industry =
    businesses[0]?.industry_name ?? factories[0]?.industry_name ?? null;

  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">속성</h3>
        <dl className="grid grid-cols-3 gap-y-1 text-sm">
          <dt className="text-slate-500">주용도</dt>
          <dd className="col-span-2">{useMain}</dd>
          <dt className="text-slate-500">업종</dt>
          <dd className="col-span-2">{industry ?? '데이터 없음'}</dd>
          <dt className="text-slate-500">연면적</dt>
          <dd className="col-span-2">{nf(building.area_total as number, ' ㎡')}</dd>
          <dt className="text-slate-500">건축면적</dt>
          <dd className="col-span-2">{nf(building.area_building as number, ' ㎡')}</dd>
          <dt className="text-slate-500">층수</dt>
          <dd className="col-span-2">
            지상 {nf(building.floors_above as number)} · 지하 {nf(building.floors_below as number)}
          </dd>
        </dl>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">탄소배출 (최근)</h3>
        <p className="text-2xl font-bold">{nf(building.co2_kg_month as number, ' kg/월')}</p>
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

      <ActionRecommender
        useMainCode={useMainCode ?? null}
        industryCode={businesses[0]?.industry_code ?? factories[0]?.industry_code ?? null}
      />

      <footer className="border-t border-slate-200 pt-2 text-[10px] text-slate-400">
        ID {shortId(building.building_id as string)} · PNU {shortId(building.pnu as string)} ·
        {' '}데이터는 추정치, 정성적 비교용
      </footer>
    </div>
  );
}
