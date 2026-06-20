import { describe, expect, it } from 'vitest';
import { estimateRooftopSolarEconomics } from '@/lib/solar-economics';

describe('solar-economics', () => {
  it('uses the provided 985m2 baseline', () => {
    const result = estimateRooftopSolarEconomics({ area_total: 985, floors_above: 1 });

    expect(result.roof_area_m2).toBe(985);
    expect(result.install_cost_krw).toBe(120_000_000);
    expect(result.annual_value_krw).toBe(40_000_000);
    expect(result.payback_years).toBe(3);
    expect(result.basis).toBe('roof_estimate');
  });

  it('scales installation cost and annual value by roof area', () => {
    const result = estimateRooftopSolarEconomics({ area_total: 492.5, floors_above: 1 });

    expect(result.install_cost_krw).toBe(60_000_000);
    expect(result.annual_value_krw).toBe(20_000_000);
    expect(result.payback_years).toBe(3);
  });

  it('falls back to total area when floors are unavailable', () => {
    const result = estimateRooftopSolarEconomics({ area_total: 985, floors_above: null });

    expect(result.roof_area_m2).toBe(985);
    expect(result.basis).toBe('area_total_fallback');
  });
});
