import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type DongItem = { name: string; code: string };

export async function GET() {
  // reason: BJCD 앞 5자리 '28200' = 인천광역시 남동구 시군구 코드.
  // 전국 admin_boundary에서 남동구 소속 동만 추출한다.
  const { data, error } = await supabasePublic
    .from('admin_boundary')
    .select('name, code')
    .eq('level', 'dong')
    .like('code', '28200%')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { dongs: (data ?? []) as DongItem[] },
    { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } },
  );
}
