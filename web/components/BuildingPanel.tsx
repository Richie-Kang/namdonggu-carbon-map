'use client';

import useSWR from 'swr';
import dynamic from 'next/dynamic';
import { useAppStore } from '@/store';
import { ActionRecommender } from './ActionRecommender';

// P2: recharts is ~80KB gzipped — load only when a building is selected.
const EnergyChart = dynamic(() => import('./EnergyChart').then((m) => m.EnergyChart), {
  ssr: false,
  loading: () => <div className="h-40 w-full animate-pulse rounded bg-slate-100" />,
});

type BuildingDetail = {
  building?: Record<string, unknown>;
  energy?: { yyyymm: string; electricity_kwh: number; gas_m3: number; co2_kg: number }[];
  businesses?: { name: string; industry_name: string; industry_code: string }[];
  factories?: { name: string; industry_name: string }[];
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

export function BuildingPanel() {
  const selected = useAppStore((s) => s.selected);
  const setSelected = useAppStore((s) => s.setSelected);
  const { data, error, isLoading } = useSWR(
    selected ? `/api/aggregate?building_id=${encodeURIComponent(selected.building_id)}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  if (!selected) return null;
  const b = (data?.building ?? selected) as Record<string, unknown>;
  const industry = data?.businesses?.[0]?.industry_code as string | undefined;
  const industryName =
    (data?.businesses?.[0]?.industry_name as string | undefined) ??
    (data?.factories?.[0]?.industry_name as string | undefined);

  return (
    <aside className="absolute right-4 top-4 bottom-4 z-10 flex w-[360px] flex-col rounded-lg bg-white/97 p-4 shadow-lg overflow-auto">
      <button
        onClick={() => setSelected(null)}
        className="self-end text-xs text-slate-500 hover:text-slate-900"
        aria-label="닫기"
      >
        ✕
      </button>
      <h2 className="text-lg font-semibold leading-tight">{(b.name as string) || '건물 정보'}</h2>
      <p className="text-xs text-slate-500">{String(b.building_id ?? '')}</p>

      {error && <p className="text-sm text-red-600">불러오기 실패</p>}
      {isLoading && <p className="text-sm text-slate-500">불러오는 중…</p>}

      <dl className="mt-2 grid grid-cols-3 gap-y-1 text-sm">
        <dt className="col-span-1 text-slate-500">지번주소</dt>
        <dd className="col-span-2">{String(b.pnu ?? '—')}</dd>
        <dt className="col-span-1 text-slate-500">주용도</dt>
        <dd className="col-span-2">{String(b.use_main ?? '—')}</dd>
        <dt className="col-span-1 text-slate-500">업종</dt>
        <dd className="col-span-2">{industryName ?? '—'}</dd>
        <dt className="col-span-1 text-slate-500">연면적</dt>
        <dd className="col-span-2">{nf(b.area_total as number, ' ㎡')}</dd>
        <dt className="col-span-1 text-slate-500">합계 CO₂</dt>
        <dd className="col-span-2">{nf(b.co2_kg_month as number, ' kg/월')}</dd>
      </dl>

      {data?.energy && data.energy.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-1">최근 12개월</h3>
          <EnergyChart data={data.energy.slice().reverse()} />
        </div>
      )}

      <ActionRecommender
        useMainCode={(b.use_main_code as string | undefined) ?? null}
        industryCode={industry ?? null}
      />
    </aside>
  );
}
