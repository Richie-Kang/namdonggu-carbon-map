import { describe, expect, it } from 'vitest';
import { estimateActionEconomics } from '@/lib/action-economics';

describe('action-economics', () => {
  it('estimates monthly savings and BEP from default tariffs', () => {
    const result = estimateActionEconomics(
      { estimated_saving_pct: 10, investment_range_krw: [1_000_000, 2_000_000] },
      { electricity_kwh_month: 1000, gas_m3_month: 100, co2_kg_month: 700 },
    );

    expect(result.estimated_monthly_cost_saving_krw).toBe(27_000);
    expect(result.estimated_monthly_co2_saving_kg).toBe(70);
    expect(result.bep_months_range).toEqual([38, 75]);
  });

  it('returns null BEP when usage cost is unavailable', () => {
    const result = estimateActionEconomics(
      { estimated_saving_pct: 10, investment_range_krw: [1_000_000, 2_000_000] },
      { electricity_kwh_month: null, gas_m3_month: null, co2_kg_month: null },
    );

    expect(result.estimated_monthly_cost_saving_krw).toBeNull();
    expect(result.bep_months_range).toBeNull();
  });
});
