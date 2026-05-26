/**
 * web/lib/onnx.ts — Lazily load ONNX model (Node runtime, ADR-0016).
 *
 * The model artifact lives at web/public/models/population.onnx
 * (gitignored; produced by ai/convert_onnx.py).
 */
import path from 'node:path';
import fs from 'node:fs/promises';

type Session = unknown;

let cached: Promise<{ session: Session; meta: ModelMeta }> | null = null;

export type ModelMeta = {
  version: string;
  feature_cols: string[];
  energy_coeffs: Record<string, { elec_kwh_per_pop: number; gas_m3_per_pop: number }>;
  emission_factors: { electricity_kg_per_kwh: number; gas_kg_per_m3: number };
};

async function loadOnce(): Promise<{ session: Session; meta: ModelMeta }> {
  const modelPath = path.join(process.cwd(), 'public', 'models', 'population.onnx');
  const metaPath = path.join(process.cwd(), 'public', 'models', 'population.meta.json');
  const [_, metaRaw] = await Promise.all([
    fs.access(modelPath),
    fs.readFile(metaPath, 'utf-8'),
  ]);
  const meta = JSON.parse(metaRaw) as ModelMeta;
  // reason: dynamic import keeps onnxruntime-node out of edge bundles
  const ort = await import('onnxruntime-node');
  const session = await ort.InferenceSession.create(modelPath);
  return { session, meta };
}

export function getModel() {
  if (!cached) cached = loadOnce();
  return cached;
}
