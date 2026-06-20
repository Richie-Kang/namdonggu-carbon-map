import { NextResponse } from 'next/server';
import { configuredSupabaseUrl, supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Health = {
  db: 'ok' | 'fail' | 'unconfigured';
  model: 'ok' | 'fail' | 'unconfigured';
  tiles: 'ok' | 'fail' | 'unconfigured';
  version: string;
  checked_at: string;
};

async function checkDb(): Promise<Health['db']> {
  if (!configuredSupabaseUrl()) return 'unconfigured';
  // reason: stub or unreachable URLs should not hang the health check.
  const timeoutMs = 1500;
  try {
    const result = await Promise.race([
      supabaseAdmin.from('emission_factors').select('source', { count: 'exact', head: true }),
      new Promise<{ error: unknown }>((resolve) =>
        setTimeout(() => resolve({ error: new Error('timeout') }), timeoutMs)
      ),
    ]);
    return (result as { error: unknown }).error ? 'fail' : 'ok';
  } catch {
    return 'fail';
  }
}

async function checkModel(): Promise<Health['model']> {
  // reason: Model warm-up gated by env to avoid pulling onnxruntime on every health hit.
  if (process.env.SKIP_MODEL_HEALTH === '1') return 'unconfigured';
  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const modelPath = path.join(process.cwd(), 'public', 'models', 'population.onnx');
    await fs.access(modelPath);
    return 'ok';
  } catch {
    return 'unconfigured';
  }
}

async function checkTiles(): Promise<Health['tiles']> {
  const tilesUrl = process.env.NEXT_PUBLIC_PMTILES_URL || '/tiles';
  if (!tilesUrl) return 'unconfigured';
  if (tilesUrl.startsWith('/')) {
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      await fs.access(path.join(process.cwd(), 'public', tilesUrl, 'buildings.pmtiles'));
      return 'ok';
    } catch {
      return 'fail';
    }
  }
  return 'ok';
}

export async function GET() {
  const [db, model, tiles] = await Promise.all([checkDb(), checkModel(), checkTiles()]);
  const body: Health = {
    db,
    model,
    tiles,
    version: process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0',
    checked_at: new Date().toISOString(),
  };
  const overallOk = db !== 'fail' && model !== 'fail' && tiles !== 'fail';
  return NextResponse.json(body, { status: overallOk ? 200 : 503 });
}
