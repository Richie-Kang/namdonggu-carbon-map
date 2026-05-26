/**
 * scripts/check-factors.ts — DB ↔ code emission-factor parity gate (P2).
 *
 * Compares `web/lib/emission-factors.ts` constants with the
 * `emission_factors` table. Fails build if any factor or unit drifts.
 *
 * Skip behaviour: if Supabase env vars are unset, exits 0 with a warning
 * (so local dev / CI without secrets remain green).
 */
import { createClient } from '@supabase/supabase-js';
import { EMISSION_FACTORS } from '../lib/emission-factors';

type Row = { source: string; factor: number; unit: string };

const KEY_MAP: Record<keyof typeof EMISSION_FACTORS, string> = {
  electricity: 'electricity',
  gas_lng: 'gas_lng',
};

async function main(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes('stub')) {
    console.warn('[check-factors] Supabase env missing — skipping parity check');
    return 0;
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from('emission_factors')
    .select('source, factor, unit');
  if (error) {
    console.error('[check-factors] DB error:', error.message);
    return 1;
  }
  const rows = (data ?? []) as Row[];
  const bySource = new Map(rows.map((r) => [r.source, r] as const));
  const failures: string[] = [];
  for (const [codeKey, dbKey] of Object.entries(KEY_MAP) as [keyof typeof EMISSION_FACTORS, string][]) {
    const code = EMISSION_FACTORS[codeKey];
    const db = bySource.get(dbKey);
    if (!db) {
      failures.push(`missing in DB: ${dbKey}`);
      continue;
    }
    if (Math.abs(Number(db.factor) - code.factor) > 1e-6) {
      failures.push(`factor mismatch ${dbKey}: code=${code.factor} db=${db.factor}`);
    }
    if (db.unit !== code.unit) {
      failures.push(`unit mismatch ${dbKey}: code=${code.unit} db=${db.unit}`);
    }
  }
  if (failures.length) {
    for (const f of failures) console.error(`[check-factors] ${f}`);
    return 1;
  }
  console.log(`[check-factors] OK ${rows.length} rows`);
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(err);
  process.exit(2);
});
