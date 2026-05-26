import { NextResponse, type NextRequest } from 'next/server';
import { supabasePublic } from '@/lib/supabase';
import { BuildingId } from '@/lib/zod-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('building_id') ?? '';
  const parsed = BuildingId.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_building_id' }, { status: 400 });
  }
  const { data, error } = await supabasePublic.rpc('get_building_detail', {
    p_building_id: parsed.data,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (data && typeof data === 'object' && 'error' in data && (data as { error: string }).error === 'not_found') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
  });
}
