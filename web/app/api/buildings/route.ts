import { NextResponse, type NextRequest } from 'next/server';
import { supabasePublic } from '@/lib/supabase';
import { BBox } from '@/lib/zod-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 10000;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('bbox') ?? '';
  const parsed = BBox.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_bbox' }, { status: 400 });
  }
  const [w, s, e, n] = parsed.data;
  const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? '5000');
  const offsetParam = Number(req.nextUrl.searchParams.get('offset') ?? '0');
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, limitParam), MAX_LIMIT) : 5000;
  const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

  const { data, error } = await supabasePublic.rpc('get_buildings_bbox', {
    p_west: w, p_south: s, p_east: e, p_north: n, p_limit: limit, p_offset: offset,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? { type: 'FeatureCollection', features: [], meta: {} }, {
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=900' },
  });
}
