import type { ActionCard } from './recommendations';

export const ENERGY_PRICE_KRW = {
  electricity_per_kwh: 160,
  gas_per_m3: 1050,
} as const;

export type ActionEconomics = {
  estimated_monthly_cost_saving_krw: number | null;
  estimated_monthly_co2_saving_kg: number | null;
  investment_range_krw: [number, number] | null;
  bep_months_range: [number, number] | null;
};

function roundTo(value: number, unit: number): number {
  return Math.round(value / unit) * unit;
}

export function estimateActionEconomics(
  action: Pick<ActionCard, 'estimated_saving_pct' | 'investment_range_krw'>,
  input: { electricity_kwh_month: number | null; gas_m3_month: number | null; co2_kg_month: number | null },
): ActionEconomics {
  const pct = action.estimated_saving_pct / 100;
  const electricity = Math.max(0, input.electricity_kwh_month ?? 0);
  const gas = Math.max(0, input.gas_m3_month ?? 0);
  const monthlyCost = electricity * ENERGY_PRICE_KRW.electricity_per_kwh + gas * ENERGY_PRICE_KRW.gas_per_m3;
  const monthlySaving = monthlyCost > 0 ? roundTo(monthlyCost * pct, 1000) : null;
  const co2Saving =
    input.co2_kg_month != null && input.co2_kg_month > 0
      ? Math.round(input.co2_kg_month * pct)
      : null;

  let bep: [number, number] | null = null;
  if (monthlySaving != null && monthlySaving > 0 && action.investment_range_krw) {
    const [low, high] = action.investment_range_krw;
    bep = [Math.ceil(low / monthlySaving), Math.ceil(high / monthlySaving)];
  }

  return {
    estimated_monthly_cost_saving_krw: monthlySaving,
    estimated_monthly_co2_saving_kg: co2Saving,
    investment_range_krw: action.investment_range_krw,
    bep_months_range: bep,
  };
}
