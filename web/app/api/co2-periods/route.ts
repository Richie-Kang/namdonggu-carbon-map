import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MonthRow = { yyyymm: string | null };

export async function GET() {
  const { data, error } = await supabasePublic.rpc('get_available_months');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const months = Array.from(
    new Set(
      ((data ?? []) as MonthRow[])
        .map((row) => String(row.yyyymm ?? ''))
        .filter((yyyymm) => /^\d{6}$/.test(yyyymm)),
    ),
  ).sort((a, b) => b.localeCompare(a));
  const years = Array.from(new Set(months.map((yyyymm) => yyyymm.slice(0, 4)))).sort((a, b) =>
    b.localeCompare(a),
  );

  return NextResponse.json(
    { months, years },
    { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=900' } },
  );
}
