export type UsageUnit = 'monthly' | 'annual';

export function applyUsageDelta(baseMonthly: number, deltaPct: number): number {
  const base = Number.isFinite(baseMonthly) ? Math.max(0, baseMonthly) : 0;
  const multiplier = 1 + deltaPct / 100;
  return Math.max(0, base * multiplier);
}

export function formatUsageForUnit(monthlyValue: number, unit: UsageUnit): number {
  const value = Number.isFinite(monthlyValue) ? Math.max(0, monthlyValue) : 0;
  return unit === 'annual' ? value * 12 : value;
}

export function unitSuffix(unit: UsageUnit): string {
  return unit === 'annual' ? '년' : '월';
}
