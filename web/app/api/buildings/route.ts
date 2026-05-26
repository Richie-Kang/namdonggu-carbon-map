import { NextResponse, type NextRequest } from 'next/server';
import { supabasePublic } from '@/lib/supabase';
import { BBox } from '@/lib/zod-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('bbox') ?? '';
  const parsed = BBox.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_bbox' }, { status: 400 });
  }
  const [w, s, e, n] = parsed.data;
  const { data, error } = await supabasePublic.rpc('get_buildings_bbox', {
    p_west: w, p_south: s, p_east: e, p_north: n,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(
    { type: 'FeatureCollection', features: data ?? [] },
    { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=900' } }
  );
}
