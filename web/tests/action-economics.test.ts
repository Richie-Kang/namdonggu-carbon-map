import { describe, expect, it } from 'vitest';
import { estimateActionEconomics } from '@/lib/action-economics';

describe('action-economics', () => {
  it('estimates monthly savings and BEP from default tariffs', () => {
    const result = estimateActionEconomics(
      {
        id: 'generic',
        estimated_saving_pct: 10,
        investment_range_krw: [1_000_000, 2_000_000],
        calculationMode: 'default_percent',
      },
      { electricity_kwh_month: 1000, gas_m3_month: 100, co2_kg_month: 700 },
    );

    expect(result.estimated_monthly_cost_saving_krw).toBe(27_000);
    expect(result.estimated_monthly_co2_saving_kg).toBe(70);
    expect(result.bep_months_range).toEqual([38, 75]);
  });

  it('returns null BEP when usage cost is unavailable', () => {
    const result = estimateActionEconomics(
      {
        id: 'generic',
        estimated_saving_pct: 10,
        investment_range_krw: [1_000_000, 2_000_000],
        calculationMode: 'default_percent',
      },
      { electricity_kwh_month: null, gas_m3_month: null, co2_kg_month: null },
    );

    expect(result.estimated_monthly_cost_saving_krw).toBeNull();
    expect(result.bep_months_range).toBeNull();
  });

  it('estimates LED investment from floor area and BEP from measured electricity', () => {
    const result = estimateActionEconomics(
      {
        id: 'led',
        estimated_saving_pct: 5,
        investment_range_krw: null,
        calculationMode: 'led_area_estimate',
      },
      { electricity_kwh_month: 10_000, gas_m3_month: 0, co2_kg_month: 5000 },
      { area_total: 1200 },
    );

    expect(result.investment_range_krw).toEqual([3_600_000, 18_000_000]);
    expect(result.estimated_monthly_cost_saving_krw).toBe(67_000);
    expect(result.estimated_monthly_co2_saving_kg).toBe(199);
    expect(result.bep_months_range).toEqual([54, 269]);
  });

  it('estimates LED savings from area when measured electricity is unavailable', () => {
    const result = estimateActionEconomics(
      {
        id: 'led',
        estimated_saving_pct: 5,
        investment_range_krw: null,
        calculationMode: 'led_area_estimate',
      },
      { electricity_kwh_month: null, gas_m3_month: null, co2_kg_month: null },
      { area_total: 1200 },
    );

    expect(result.investment_range_krw).toEqual([3_600_000, 18_000_000]);
    expect(result.estimated_monthly_cost_saving_krw).toBe(67_000);
    expect(result.bep_months_range).toEqual([54, 269]);
  });

  it('estimates HVAC investment and BEP from area and electricity', () => {
    const result = estimateActionEconomics(
      {
        id: 'hvac_efficient',
        estimated_saving_pct: 10,
        investment_range_krw: null,
        calculationMode: 'hvac_area_estimate',
      },
      { electricity_kwh_month: 10_000, gas_m3_month: 0, co2_kg_month: 5000 },
      { area_total: 1200 },
    );

    expect(result.investment_range_krw).toEqual([34_000_000, 126_000_000]);
    expect(result.estimated_monthly_cost_saving_krw).toBe(240_000);
    expect(result.bep_months_range).toEqual([142, 525]);
  });

  it('estimates area-energy proxy actions instead of leaving them blank', () => {
    const result = estimateActionEconomics(
      {
        id: 'waste_heat',
        estimated_saving_pct: 12,
        investment_range_krw: null,
        calculationMode: 'area_energy_proxy_estimate',
      },
      { electricity_kwh_month: 10_000, gas_m3_month: 100, co2_kg_month: 5000 },
      { area_total: 1200 },
    );

    expect(result.investment_range_krw).toEqual([72_000_000, 264_000_000]);
    expect(result.estimated_monthly_cost_saving_krw).toBe(16_000);
    expect(result.bep_months_range).toEqual([4500, 16500]);
    expect(result.estimate_note).toContain('예측치');
  });
});
