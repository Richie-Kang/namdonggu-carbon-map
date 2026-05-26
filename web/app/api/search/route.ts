import { NextResponse, type NextRequest } from 'next/server';
import { supabasePublic } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LEN = 80;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, MAX_LEN);
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit') ?? 12), 1), 50);
  const { data, error } = await supabasePublic.rpc('search_buildings', {
    p_q: q,
    p_limit: limit,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(
    { results: data ?? [] },
    { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=120' } }
  );
}
