import { z } from 'zod';

export const BBox = z
  .string()
  .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, 'bbox=W,S,E,N')
  .transform((s) => s.split(',').map(Number) as [number, number, number, number])
  .refine(([w, s, e, n]) => w < e && s < n, 'invalid bbox order')
  .refine(([w, s, e, n]) => e - w < 0.5 && n - s < 0.5, 'bbox too wide (>0.5°)');

export const BuildingId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

export const Pnu = z.string().regex(/^\d{19}$/, 'PNU must be 19 digits');

export const LandUseCategory = z.enum(['residential', 'commercial', 'industrial', 'other']);

export const UseMainCode = z.string().regex(/^\d{1,10}$/);

export const PredictRequest = z.object({
  building_id: BuildingId,
  use_main_code: UseMainCode,
  land_use_category: LandUseCategory,
  // Backwards-compatible: clients may pass either the legacy %-delta OR an
  // explicit absolute target population. If both are supplied the absolute
  // value wins.
  pop_delta_pct: z.number().min(-100).max(500).optional(),
  target_population: z.number().min(0).max(100000).optional(),
});

export type PredictRequest = z.infer<typeof PredictRequest>;

export const PredictResponse = z.object({
  co2_pred: z.number(),
  delta_kg: z.number(),
  breakdown: z.object({
    electricity_kwh: z.number(),
    gas_m3: z.number(),
  }),
  population_baseline: z.number(),
  population_used: z.number(),
  model_version: z.string(),
  warnings: z.array(z.string()).optional(),
});

export type PredictResponse = z.infer<typeof PredictResponse>;

export const ReportAction = z.object({
  title: z.string(),
  rationale: z.string(),
  estimated_saving_pct: z.number().nullable(),
});

export const ReportResponse = z.object({
  summary: z.string(),
  emission_drivers: z.array(z.string()).min(1),
  recommended_actions: z.array(ReportAction).min(1),
  estimated_impact: z.string(),
  caveats: z.array(z.string()).min(1),
});

export type ReportAction = z.infer<typeof ReportAction>;
export type ReportResponse = z.infer<typeof ReportResponse>;
