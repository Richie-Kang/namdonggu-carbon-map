import { NextResponse, type NextRequest } from 'next/server';
import { supabasePublic } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type QuintileRow = { building_id: string | null; co2_quintile: number | null };
type EnergyRow = { building_id: string | null; co2_kg: number | null };

const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

function validateMonth(value: string | null): string | null {
  return value && /^\d{6}$/.test(value) ? value : null;
}

function validateYear(value: string | null): string | null {
  return value && /^\d{4}$/.test(value) ? value : null;
}

function toQuintiles(totals: Map<string, number>): QuintileRow[] {
  const sorted = Array.from(totals.entries())
    .filter(([, co2]) => Number.isFinite(co2) && co2 > 0)
    .sort((a, b) => a[1] - b[1]);
  const n = sorted.length;
  return sorted.map(([building_id], index) => ({
    building_id,
    co2_quintile: Math.min(5, Math.floor((index * 5) / Math.max(1, n)) + 1),
  }));
}

async function annualQuintiles(year: string): Promise<{ data: QuintileRow[] | null; error: string | null }> {
  const totals = new Map<string, number>();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabasePublic
      .from('building_energy')
      .select('building_id, co2_kg')
      .like('yyyymm', `${year}%`)
      .not('co2_kg', 'is', null)
      .gt('co2_kg', 0)
      .range(from, to);

    if (error) return { data: null, error: error.message };
    const rows = (data ?? []) as EnergyRow[];
    for (const row of rows) {
      if (!row.building_id || row.co2_kg == null) continue;
      totals.set(row.building_id, (totals.get(row.building_id) ?? 0) + row.co2_kg);
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return { data: toQuintiles(totals), error: null };
}

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get('period');

  if (period === 'monthly') {
    const yyyymm = validateMonth(req.nextUrl.searchParams.get('yyyymm'));
    if (!yyyymm) return NextResponse.json({ error: 'invalid_yyyymm' }, { status: 400 });
    const { data, error } = await supabasePublic.rpc('get_monthly_quintiles', { p_yyyymm: yyyymm });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(
      { rows: ((data ?? []) as QuintileRow[]).filter((row) => row.building_id && row.co2_quintile) },
      { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=900' } },
    );
  }

  if (period === 'annual') {
    const year = validateYear(req.nextUrl.searchParams.get('year'));
    if (!year) return NextResponse.json({ error: 'invalid_year' }, { status: 400 });
    const { data, error } = await annualQuintiles(year);
    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json(
      { rows: data ?? [] },
      { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=900' } },
    );
  }

  return NextResponse.json({ error: 'invalid_period' }, { status: 400 });
}
