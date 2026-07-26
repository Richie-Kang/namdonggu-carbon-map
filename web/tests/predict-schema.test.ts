import { describe, expect, it } from 'vitest';
import { PredictRequest } from '@/lib/zod-schemas';

const BASE_REQUEST = {
  building_id: '2001174044934389442500000000',
  use_main_code: '09000',
  land_use_category: 'public' as const,
};

describe('PredictRequest', () => {
  it('accepts public land use', () => {
    expect(PredictRequest.safeParse(BASE_REQUEST).success).toBe(true);
  });

  it('accepts observed gas usage above the previous one-million limit', () => {
    const parsed = PredictRequest.safeParse({
      ...BASE_REQUEST,
      baseline_population: 79.94,
      baseline_gas_m3: 2_062_188.67,
      gas_delta_pct: 300,
    });

    expect(parsed.success).toBe(true);
  });
});
