import { describe, expect, it } from 'vitest';
import { calculateScenarioEnergy } from '@/lib/simulation-model';

const BASE_INPUT = {
  baseline: { electricity_kwh: 1000, gas_m3: 100 },
  populationBaseline: 10,
  populationUsed: 10,
  currentUseCode: '04000',
  requestedUseCode: '04000',
  currentUseCategory: 'commercial' as const,
  requestedUseCategory: 'commercial' as const,
  currentLandUse: 'commercial' as const,
  requestedLandUse: 'commercial' as const,
  currentCoefficients: {
    elec_kwh_per_pop_month: 100,
    gas_m3_per_pop_month: 10,
  },
  requestedCoefficients: {
    elec_kwh_per_pop_month: 100,
    gas_m3_per_pop_month: 10,
  },
};

describe('calculateScenarioEnergy', () => {
  it('keeps observed energy unchanged for the baseline scenario', () => {
    expect(calculateScenarioEnergy(BASE_INPUT)).toEqual({
      electricity_kwh: 1000,
      gas_m3: 100,
    });
  });

  it('applies population changes to both energy sources', () => {
    const result = calculateScenarioEnergy({
      ...BASE_INPUT,
      populationUsed: 20,
    });

    expect(result.electricity_kwh).toBe(2000);
    expect(result.gas_m3).toBe(200);
  });

  it('accepts a 300 percent gas increase without an absolute usage ceiling', () => {
    const result = calculateScenarioEnergy({
      ...BASE_INPUT,
      baseline: { electricity_kwh: 1_900_000, gas_m3: 2_100_000 },
      gasDeltaPct: 300,
    });

    expect(result.gas_m3).toBe(8_400_000);
  });

  it('changes energy when the building main use changes', () => {
    const result = calculateScenarioEnergy({
      ...BASE_INPUT,
      requestedUseCode: '17000',
      requestedUseCategory: 'industrial',
      requestedCoefficients: {
        elec_kwh_per_pop_month: 300,
        gas_m3_per_pop_month: 20,
      },
    });

    expect(result.electricity_kwh).toBe(3000);
    expect(result.gas_m3).toBe(200);
  });

  it('keeps population neutral when use changes but the target population stays fixed', () => {
    const result = calculateScenarioEnergy({
      ...BASE_INPUT,
      populationBaseline: 10,
      populationUsed: 10,
      requestedUseCode: '17000',
      requestedUseCategory: 'industrial',
      requestedCoefficients: {
        elec_kwh_per_pop_month: 200,
        gas_m3_per_pop_month: 10,
      },
    });

    expect(result.electricity_kwh).toBe(2000);
    expect(result.gas_m3).toBe(100);
  });

  it('changes energy when public land use is selected', () => {
    const result = calculateScenarioEnergy({
      ...BASE_INPUT,
      requestedLandUse: 'public',
    });

    expect(result.electricity_kwh).toBe(1875);
    expect(result.gas_m3).toBe(200);
  });
});
