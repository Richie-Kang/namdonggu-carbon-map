export const ROOFTOP_SOLAR_BASE = {
  roof_area_m2: 985,
  install_cost_krw: 120_000_000,
  annual_value_krw: 40_000_000,
} as const;

export type RooftopSolarEconomics = {
  roof_area_m2: number | null;
  install_cost_krw: number | null;
  annual_value_krw: number | null;
  payback_years: number | null;
  basis: 'roof_estimate' | 'area_total_fallback' | 'unavailable';
};

function positiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function roundTo(value: number, unit: number): number {
  return Math.round(value / unit) * unit;
}

export function estimateRooftopSolarEconomics(input: {
  area_total?: unknown;
  floors_above?: unknown;
}): RooftopSolarEconomics {
  const areaTotal = positiveNumber(input.area_total);
  if (areaTotal == null) {
    return {
      roof_area_m2: null,
      install_cost_krw: null,
      annual_value_krw: null,
      payback_years: null,
      basis: 'unavailable',
    };
  }

  const floorsAbove = positiveNumber(input.floors_above);
  const roofArea = floorsAbove != null ? areaTotal / floorsAbove : areaTotal;
  const scale = roofArea / ROOFTOP_SOLAR_BASE.roof_area_m2;
  const installCost = roundTo(ROOFTOP_SOLAR_BASE.install_cost_krw * scale, 100_000);
  const annualValue = roundTo(ROOFTOP_SOLAR_BASE.annual_value_krw * scale, 100_000);

  return {
    roof_area_m2: Math.round(roofArea),
    install_cost_krw: installCost,
    annual_value_krw: annualValue,
    payback_years: annualValue > 0 ? Math.round((installCost / annualValue) * 10) / 10 : null,
    basis: floorsAbove != null ? 'roof_estimate' : 'area_total_fallback',
  };
}
