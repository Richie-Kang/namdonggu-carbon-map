import { NextResponse, type NextRequest } from 'next/server';
import { supabasePublic } from '@/lib/supabase';
import { PredictRequest, type PredictResponse } from '@/lib/zod-schemas';
import { totalCo2 } from '@/lib/emission-factors';
import { getModel } from '@/lib/onnx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESIDENTIAL_DEFAULT = { elec: 200, gas: 18 }; // kWh/person, m3/person
const COMMERCIAL_DEFAULT = { elec: 80, gas: 4 };
const INDUSTRIAL_DEFAULT = { elec: 500, gas: 30 };

async function fetchBuilding(building_id: string) {
  const { data } = await supabasePublic
    .from('buildings')
    .select('building_id, pnu, use_main_code, area_total, floors_above, floors_below, height_m, co2_kg_month')
    .eq('building_id', building_id)
    .maybeSingle();
  return data;
}

function defaultsFor(category: string) {
  if (category === 'residential') return RESIDENTIAL_DEFAULT;
  if (category === 'industrial') return INDUSTRIAL_DEFAULT;
  if (category === 'commercial') return COMMERCIAL_DEFAULT;
  return COMMERCIAL_DEFAULT;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = PredictRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'schema', issues: parsed.error.issues }, { status: 400 });
  }
  const { building_id, use_main_code, land_use_category, pop_delta_pct, target_population } = parsed.data;

  const building = await fetchBuilding(building_id);
  if (!building) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Estimate baseline population.
  // reason: if ONNX model unavailable, fall back to area-based heuristic.
  let popPred = Math.max(1, (building.area_total ?? 100) / 25);
  let warnings: string[] = [];
  let modelVersion = 'rule-based-0.1';

  try {
    const { session, meta } = await getModel();
    modelVersion = meta.version;
    // Build input vector matching meta.feature_cols length (11)
    const useCodeInt = parseInt(use_main_code || (building.use_main_code ?? '0'), 10) || 0;
    const features = [
      Number(building.area_total ?? 0),
      Number(building.floors_above ?? 0),
      Number(building.floors_below ?? 0),
      Number(building.height_m ?? 0),
      1990,
      useCodeInt,
      land_use_category === 'residential' ? 1 : 0,
      land_use_category === 'commercial' ? 1 : 0,
      land_use_category === 'industrial' ? 1 : 0,
      0, // business_density_50m — unknown at predict time
      0, // factory_within_100m
    ];
    const ort = await import('onnxruntime-node');
    const tensor = new ort.Tensor('float32', Float32Array.from(features), [1, features.length]);
    const out = await (session as { run: (f: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>> }).run({ input: tensor });
    const v = Object.values(out)[0]?.data;
    if (v && v.length > 0 && Number.isFinite(v[0])) {
      popPred = Math.max(1, Number(v[0]));
    } else {
      warnings.push('model_returned_empty_using_rule_based');
    }
  } catch (err) {
    warnings.push('model_load_failed_using_rule_based');
  }

  // Resolve effective population: absolute target wins, else %-delta, else baseline.
  let popAdj: number;
  if (typeof target_population === 'number') {
    popAdj = Math.max(0, target_population);
  } else if (typeof pop_delta_pct === 'number') {
    popAdj = popPred * (1 + pop_delta_pct / 100);
  } else {
    popAdj = popPred;
  }
  const defaults = defaultsFor(land_use_category);
  const electricity_kwh = Math.max(0, popAdj * defaults.elec);
  const gas_m3 = Math.max(0, popAdj * defaults.gas);
  let co2_pred = totalCo2({ electricity_kwh, gas_m3 });
  const co2_cur = Number(building.co2_kg_month ?? 0);

  // P1 fix (US-6 AC): clamp predictions to [0, 10×current] to prevent runaway
  // outputs when the simulator is pushed to extreme values.
  if (co2_cur > 0) {
    const upper = co2_cur * 10;
    if (co2_pred > upper) {
      warnings.push('clamped_above_10x_current');
      co2_pred = upper;
    }
  }
  if (co2_pred < 0) co2_pred = 0;
  const delta_kg = co2_pred - co2_cur;

  const res: PredictResponse = {
    co2_pred,
    delta_kg,
    breakdown: { electricity_kwh, gas_m3 },
    population_baseline: popPred,
    population_used: popAdj,
    model_version: modelVersion,
    warnings: warnings.length ? warnings : undefined,
  };
  return NextResponse.json(res, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
