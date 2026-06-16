import { describe, expect, it } from 'vitest';
import { applyUsageDelta, formatUsageForUnit } from '@/lib/simulation-utils';

describe('simulation-utils', () => {
  it('applies percentage changes to monthly usage', () => {
    expect(applyUsageDelta(1000, 20)).toBe(1200);
  });

  it('clamps a full reduction at zero', () => {
    expect(applyUsageDelta(1000, -100)).toBe(0);
  });

  it('converts monthly values to annual display values', () => {
    expect(formatUsageForUnit(100, 'annual')).toBe(1200);
    expect(formatUsageForUnit(100, 'monthly')).toBe(100);
  });
});
