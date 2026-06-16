import { describe, it, expect } from 'vitest';
import {
  co2FromElectricity,
  co2FromGas,
  electricityKwhFromCo2,
  totalCo2,
  EMISSION_FACTORS,
} from '@/lib/emission-factors';

describe('emission-factors', () => {
  it('matches public factors', () => {
    expect(EMISSION_FACTORS.electricity.factor).toBe(0.4781);
    expect(EMISSION_FACTORS.gas_lng.factor).toBe(2.176);
  });

  it('multiplies kWh by factor', () => {
    expect(co2FromElectricity(1000)).toBeCloseTo(478.1, 1);
  });

  it('multiplies m3 by factor', () => {
    expect(co2FromGas(100)).toBeCloseTo(217.6, 1);
  });

  it('totals correctly', () => {
    expect(totalCo2({ electricity_kwh: 1000, gas_m3: 100 })).toBeCloseTo(478.1 + 217.6, 1);
  });

  it('converts CO2 back to electricity-equivalent kWh', () => {
    expect(electricityKwhFromCo2(478.1)).toBeCloseTo(1000, 1);
  });
});
