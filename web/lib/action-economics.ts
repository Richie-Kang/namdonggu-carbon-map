import type { ActionCard } from './recommendations';
import { EMISSION_FACTORS } from './emission-factors';
import { estimateRooftopSolarEconomics } from './solar-economics';

export const ENERGY_PRICE_KRW = {
  electricity_per_kwh: 160,
  gas_per_m3: 1050,
} as const;

export type ActionEconomicsInput = {
  electricity_kwh_month: number | null;
  gas_m3_month: number | null;
  co2_kg_month: number | null;
};

export type BuildingEconomicsInput = {
  area_total?: unknown;
  floors_above?: unknown;
};

export type ActionEconomics = {
  estimated_monthly_cost_saving_krw: number | null;
  estimated_monthly_co2_saving_kg: number | null;
  investment_range_krw: [number, number] | null;
  bep_months_range: [number, number] | null;
  estimate_note: string | null;
};

function roundTo(value: number, unit: number): number {
  return Math.round(value / unit) * unit;
}

function ceilTo(value: number, unit: number): number {
  return Math.ceil(value / unit) * unit;
}

function positiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function rangeBep(investment: [number, number] | null, monthlySaving: number | null): [number, number] | null {
  if (!investment || monthlySaving == null || monthlySaving <= 0) return null;
  const [low, high] = investment;
  return [Math.ceil(low / monthlySaving), Math.ceil(high / monthlySaving)];
}

function estimateLedEconomics(
  input: ActionEconomicsInput,
  building?: BuildingEconomicsInput,
): ActionEconomics {
  const area = positiveNumber(building?.area_total) ?? 800;

  const lowFixtureCount = Math.ceil(area / 20);
  const highFixtureCount = Math.ceil(area / 12);
  const midFixtureCount = Math.round((lowFixtureCount + highFixtureCount) / 2);
  const investment: [number, number] = [
    ceilTo(lowFixtureCount * 60_000, 100_000),
    ceilTo(highFixtureCount * 180_000, 100_000),
  ];

  const electricity = Math.max(0, input.electricity_kwh_month ?? 0);
  const estimatedLightingSavingKwh = (midFixtureCount * 40 * 0.5 * 260) / 1000;
  const cappedSavingKwh = electricity > 0
    ? Math.min(estimatedLightingSavingKwh, electricity * 0.2)
    : estimatedLightingSavingKwh;
  const monthlySaving = roundTo(cappedSavingKwh * ENERGY_PRICE_KRW.electricity_per_kwh, 1000);
  const co2Saving = Math.round(cappedSavingKwh * EMISSION_FACTORS.electricity.factor);

  return {
    estimated_monthly_cost_saving_krw: monthlySaving,
    estimated_monthly_co2_saving_kg: co2Saving,
    investment_range_krw: investment,
    bep_months_range: rangeBep(investment, monthlySaving),
    estimate_note: 'LED 투자비는 연면적 12~20㎡당 1개, 개당 6만~18만원 기준입니다. 절감액은 40W 형광등을 50% 절감하는 LED로 교체하고 월 260시간 운영한다고 가정한 예측치입니다.',
  };
}

function estimateHvacEconomics(input: ActionEconomicsInput, building?: BuildingEconomicsInput): ActionEconomics {
  const area = positiveNumber(building?.area_total) ?? 1000;
  const lowKw = area * 0.08;
  const highKw = area * 0.15;
  const investment: [number, number] = [
    ceilTo(lowKw * 350_000, 1_000_000),
    ceilTo(highKw * 700_000, 1_000_000),
  ];
  const electricity = Math.max(0, input.electricity_kwh_month ?? 0);
  const estimatedSavingKwh = electricity > 0
    ? Math.min(electricity * 0.15, area * 4)
    : area * 4;
  const monthlySaving = roundTo(estimatedSavingKwh * ENERGY_PRICE_KRW.electricity_per_kwh, 1000);
  const co2Saving = Math.round(estimatedSavingKwh * EMISSION_FACTORS.electricity.factor);

  return {
    estimated_monthly_cost_saving_krw: monthlySaving,
    estimated_monthly_co2_saving_kg: co2Saving,
    investment_range_krw: investment,
    bep_months_range: rangeBep(investment, monthlySaving),
    estimate_note: '공조 투자비는 연면적 기준 냉난방 부하 80~150W/㎡, kW당 35만~70만원 기준입니다. 절감액은 월 전기 사용량의 최대 15% 또는 4kWh/㎡ 중 낮은 값을 적용한 예측치입니다.',
  };
}

type ProxyConfig = {
  costPerM2: [number, number];
  minInvestment: [number, number];
  maxInvestment: [number, number];
  source: 'electricity' | 'gas' | 'total';
  sourceSavingPct: number;
  fallbackMonthlySavingPerM2: number;
  note: string;
};

const PROXY_CONFIG: Record<string, ProxyConfig> = {
  heat_recovery: {
    costPerM2: [80_000, 180_000],
    minInvestment: [8_000_000, 18_000_000],
    maxInvestment: [80_000_000, 180_000_000],
    source: 'total',
    sourceSavingPct: 0.08,
    fallbackMonthlySavingPerM2: 900,
    note: 'ERV 투자비는 주방·환기 구역 면적을 전체 연면적의 일부로 보는 프록시 단가 8만~18만원/㎡를 적용했습니다.',
  },
  induction: {
    costPerM2: [40_000, 120_000],
    minInvestment: [5_000_000, 15_000_000],
    maxInvestment: [50_000_000, 120_000_000],
    source: 'gas',
    sourceSavingPct: 0.12,
    fallbackMonthlySavingPerM2: 700,
    note: '인덕션 전환 투자비는 조리 구역·전기 증설을 포함한 프록시 단가 4만~12만원/㎡를 적용했습니다.',
  },
  waste_heat: {
    costPerM2: [60_000, 220_000],
    minInvestment: [50_000_000, 120_000_000],
    maxInvestment: [300_000_000, 800_000_000],
    source: 'gas',
    sourceSavingPct: 0.15,
    fallbackMonthlySavingPerM2: 1_600,
    note: '폐열회수 투자비는 산업용 열교환·배관·제어 설비를 포함한 프록시 단가 6만~22만원/㎡를 적용했습니다.',
  },
  inverter_motor: {
    costPerM2: [15_000, 70_000],
    minInvestment: [8_000_000, 25_000_000],
    maxInvestment: [120_000_000, 300_000_000],
    source: 'electricity',
    sourceSavingPct: 0.08,
    fallbackMonthlySavingPerM2: 900,
    note: '인버터 모터 투자비는 팬·펌프·컴프레서 일부 전환을 가정한 프록시 단가 1.5만~7만원/㎡를 적용했습니다.',
  },
  insulation: {
    costPerM2: [80_000, 250_000],
    minInvestment: [20_000_000, 50_000_000],
    maxInvestment: [200_000_000, 500_000_000],
    source: 'total',
    sourceSavingPct: 0.07,
    fallbackMonthlySavingPerM2: 800,
    note: '단열·창호 투자비는 외피 개선 범위를 연면적 기반으로 환산한 프록시 단가 8만~25만원/㎡를 적용했습니다.',
  },
};
const DEFAULT_PROXY_CONFIG = PROXY_CONFIG.insulation as ProxyConfig;

function estimateAreaEnergyProxyEconomics(
  action: Pick<ActionCard, 'id' | 'estimated_saving_pct'>,
  input: ActionEconomicsInput,
  building?: BuildingEconomicsInput,
): ActionEconomics {
  const area = positiveNumber(building?.area_total) ?? 1000;
  const config = PROXY_CONFIG[action.id] ?? DEFAULT_PROXY_CONFIG;
  const investment: [number, number] = [
    ceilTo(clamp(area * config.costPerM2[0], config.minInvestment[0], config.maxInvestment[0]), 1_000_000),
    ceilTo(clamp(area * config.costPerM2[1], config.minInvestment[1], config.maxInvestment[1]), 1_000_000),
  ];
  const electricityCost = Math.max(0, input.electricity_kwh_month ?? 0) * ENERGY_PRICE_KRW.electricity_per_kwh;
  const gasCost = Math.max(0, input.gas_m3_month ?? 0) * ENERGY_PRICE_KRW.gas_per_m3;
  const sourceCost =
    config.source === 'electricity'
      ? electricityCost
      : config.source === 'gas'
        ? gasCost
        : electricityCost + gasCost;
  const monthlySaving = roundTo(
    sourceCost > 0 ? sourceCost * config.sourceSavingPct : area * config.fallbackMonthlySavingPerM2,
    1000,
  );
  const pct = action.estimated_saving_pct != null ? action.estimated_saving_pct / 100 : config.sourceSavingPct;
  const co2Saving =
    input.co2_kg_month != null && input.co2_kg_month > 0
      ? Math.round(input.co2_kg_month * pct)
      : Math.round((monthlySaving / ENERGY_PRICE_KRW.electricity_per_kwh) * EMISSION_FACTORS.electricity.factor);

  return {
    estimated_monthly_cost_saving_krw: monthlySaving,
    estimated_monthly_co2_saving_kg: co2Saving,
    investment_range_krw: investment,
    bep_months_range: rangeBep(investment, monthlySaving),
    estimate_note: `${config.note} 절감액은 ${
      config.source === 'electricity' ? '전기요금' : config.source === 'gas' ? '가스요금' : '월 에너지요금'
    }의 ${(config.sourceSavingPct * 100).toLocaleString('ko-KR')}%를 적용한 예측치입니다.`,
  };
}

export function estimateActionEconomics(
  action: Pick<ActionCard, 'id' | 'estimated_saving_pct' | 'investment_range_krw' | 'calculationMode'>,
  input: ActionEconomicsInput,
  building?: BuildingEconomicsInput,
): ActionEconomics {
  if (action.calculationMode === 'led_area_estimate') return estimateLedEconomics(input, building);
  if (action.calculationMode === 'hvac_area_estimate') return estimateHvacEconomics(input, building);
  if (action.calculationMode === 'area_energy_proxy_estimate') {
    return estimateAreaEnergyProxyEconomics(action, input, building);
  }

  if (action.calculationMode === 'rooftop_solar_area') {
    const economics = estimateRooftopSolarEconomics({
      area_total: building?.area_total,
      floors_above: building?.floors_above,
    });
    const monthlyProductionValue =
      economics.annual_value_krw != null ? roundTo(economics.annual_value_krw / 12, 1000) : null;
    const paybackMonths =
      economics.payback_years != null ? Math.round(economics.payback_years * 12) : null;

    return {
      estimated_monthly_cost_saving_krw: monthlyProductionValue,
      estimated_monthly_co2_saving_kg:
        input.co2_kg_month != null && action.estimated_saving_pct != null
          ? Math.round(input.co2_kg_month * (action.estimated_saving_pct / 100))
          : null,
      investment_range_krw:
        economics.install_cost_krw != null
          ? [economics.install_cost_krw, economics.install_cost_krw]
          : null,
      bep_months_range: paybackMonths != null ? [paybackMonths, paybackMonths] : null,
      estimate_note: '985㎡ 기준 설치비 1.2억원, 연간 생산·판매 가치 4천만원을 추정 옥상면적에 비례 적용했습니다.',
    };
  }

  if (action.estimated_saving_pct == null) {
    return estimateAreaEnergyProxyEconomics(action, input, building);
  }
  const pct = action.estimated_saving_pct / 100;
  const electricity = Math.max(0, input.electricity_kwh_month ?? 0);
  const gas = Math.max(0, input.gas_m3_month ?? 0);
  const monthlyCost = electricity * ENERGY_PRICE_KRW.electricity_per_kwh + gas * ENERGY_PRICE_KRW.gas_per_m3;
  const monthlySaving = monthlyCost > 0 ? roundTo(monthlyCost * pct, 1000) : null;
  const co2Saving =
    input.co2_kg_month != null && input.co2_kg_month > 0
      ? Math.round(input.co2_kg_month * pct)
      : null;

  return {
    estimated_monthly_cost_saving_krw: monthlySaving,
    estimated_monthly_co2_saving_kg: co2Saving,
    investment_range_krw: action.investment_range_krw,
    bep_months_range: rangeBep(action.investment_range_krw, monthlySaving),
    estimate_note: action.investment_range_krw
      ? '월 에너지 비용에 액션별 절감률을 적용한 단순 추정치입니다.'
      : '투자비 기준이 없어 BEP를 표시하지 않았습니다.',
  };
}
