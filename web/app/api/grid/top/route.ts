import { NextResponse, type NextRequest } from 'next/server';
import { supabasePublic } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GRID_ID_RE = /^[A-Za-z0-9_\-]{1,24}$/;

export async function GET(req: NextRequest) {
  const gridId = req.nextUrl.searchParams.get('grid_id') ?? '';
  if (!GRID_ID_RE.test(gridId)) {
    return NextResponse.json({ error: 'invalid_grid_id' }, { status: 400 });
  }
  const { data, error } = await supabasePublic.rpc('top_buildings_in_grid', {
    p_grid_id: gridId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(
    { rows: data ?? [] },
    { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } }
  );
}
