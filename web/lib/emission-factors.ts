/**
 * 환경부/온실가스종합정보센터 공시 배출계수.
 * Source of truth는 Supabase `emission_factors` 테이블. 빌드 시 동기 검증.
 */

export const EMISSION_FACTORS = {
  electricity: {
    factor: 0.4781,
    unit: 'kgCO2eq/kWh',
    reference: 'KEEI 2023 전력 배출계수',
    effective_from: '2023-01-01',
  },
  gas_lng: {
    factor: 2.176,
    unit: 'kgCO2eq/m3',
    reference: '온실가스종합정보센터 LNG 배출계수',
    effective_from: '2023-01-01',
  },
} as const;

export type EmissionSource = keyof typeof EMISSION_FACTORS;

export function co2FromElectricity(kwh: number): number {
  return kwh * EMISSION_FACTORS.electricity.factor;
}

export function co2FromGas(m3: number): number {
  return m3 * EMISSION_FACTORS.gas_lng.factor;
}

export function totalCo2(input: { electricity_kwh: number; gas_m3: number }): number {
  return co2FromElectricity(input.electricity_kwh) + co2FromGas(input.gas_m3);
}
