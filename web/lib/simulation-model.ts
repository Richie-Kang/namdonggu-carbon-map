export type SimulationLandUse = 'residential' | 'commercial' | 'industrial' | 'public' | 'other';

export type EnergyProfile = {
  electricity_kwh: number;
  gas_m3: number;
};

export type EnergyCoefficients = {
  elec_kwh_per_pop_month?: number;
  gas_m3_per_pop_month?: number;
};

const CATEGORY_PROFILES: Record<SimulationLandUse, EnergyProfile> = {
  residential: { electricity_kwh: 200, gas_m3: 18 },
  commercial: { electricity_kwh: 80, gas_m3: 4 },
  industrial: { electricity_kwh: 500, gas_m3: 30 },
  public: { electricity_kwh: 150, gas_m3: 10 },
  other: { electricity_kwh: 80, gas_m3: 4 },
};

const USE_FACTOR_MIN = 0.25;
const USE_FACTOR_MAX = 4;
const LAND_FACTOR_MIN = 0.5;
const LAND_FACTOR_MAX = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function positiveOrFallback(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function profileForUse(
  coefficients: EnergyCoefficients | undefined,
  fallbackCategory: SimulationLandUse,
): EnergyProfile {
  const fallback = CATEGORY_PROFILES[fallbackCategory];
  return {
    electricity_kwh: positiveOrFallback(coefficients?.elec_kwh_per_pop_month, fallback.electricity_kwh),
    gas_m3: positiveOrFallback(coefficients?.gas_m3_per_pop_month, fallback.gas_m3),
  };
}

function boundedRatio(next: number, current: number, min: number, max: number): number {
  if (current <= 0 || !Number.isFinite(current) || !Number.isFinite(next)) return 1;
  return clamp(next / current, min, max);
}

function baselineValue(value: number | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  return Math.max(0, fallback);
}

function deltaFactor(deltaPct: number | undefined): number {
  if (typeof deltaPct !== 'number' || !Number.isFinite(deltaPct)) return 1;
  return Math.max(0, 1 + deltaPct / 100);
}

export function calculateScenarioEnergy(input: {
  baseline: Partial<EnergyProfile>;
  populationBaseline: number;
  populationUsed: number;
  currentUseCode: string;
  requestedUseCode: string;
  currentUseCategory: SimulationLandUse;
  requestedUseCategory: SimulationLandUse;
  currentLandUse: SimulationLandUse;
  requestedLandUse: SimulationLandUse;
  currentCoefficients?: EnergyCoefficients;
  requestedCoefficients?: EnergyCoefficients;
  electricityDeltaPct?: number;
  gasDeltaPct?: number;
}): EnergyProfile {
  const currentProfile = profileForUse(input.currentCoefficients, input.currentUseCategory);
  const requestedProfile = profileForUse(input.requestedCoefficients, input.requestedUseCategory);
  const currentLandProfile = CATEGORY_PROFILES[input.currentLandUse];
  const requestedLandProfile = CATEGORY_PROFILES[input.requestedLandUse];
  const populationFactor = input.populationBaseline > 0
    ? Math.max(0, input.populationUsed) / input.populationBaseline
    : 1;

  const electricityUseFactor = input.currentUseCode === input.requestedUseCode
    ? 1
    : boundedRatio(
      requestedProfile.electricity_kwh,
      currentProfile.electricity_kwh,
      USE_FACTOR_MIN,
      USE_FACTOR_MAX,
    );
  const gasUseFactor = input.currentUseCode === input.requestedUseCode
    ? 1
    : boundedRatio(
      requestedProfile.gas_m3,
      currentProfile.gas_m3,
      USE_FACTOR_MIN,
      USE_FACTOR_MAX,
    );

  const electricityLandFactor = boundedRatio(
    requestedLandProfile.electricity_kwh,
    currentLandProfile.electricity_kwh,
    LAND_FACTOR_MIN,
    LAND_FACTOR_MAX,
  );
  const gasLandFactor = boundedRatio(
    requestedLandProfile.gas_m3,
    currentLandProfile.gas_m3,
    LAND_FACTOR_MIN,
    LAND_FACTOR_MAX,
  );

  const electricityBaseline = baselineValue(
    input.baseline.electricity_kwh,
    input.populationBaseline * currentProfile.electricity_kwh,
  );
  const gasBaseline = baselineValue(
    input.baseline.gas_m3,
    input.populationBaseline * currentProfile.gas_m3,
  );

  return {
    electricity_kwh:
      electricityBaseline *
      populationFactor *
      electricityUseFactor *
      electricityLandFactor *
      deltaFactor(input.electricityDeltaPct),
    gas_m3:
      gasBaseline *
      populationFactor *
      gasUseFactor *
      gasLandFactor *
      deltaFactor(input.gasDeltaPct),
  };
}
