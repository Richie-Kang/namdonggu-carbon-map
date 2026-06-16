import { describe, expect, it } from 'vitest';
import { resolveBuildingHeight } from '@/lib/building-metrics';

describe('building-metrics', () => {
  it('keeps a positive measured height', () => {
    expect(resolveBuildingHeight(12.5, 5)).toEqual({ value: 12.5, estimated: false });
  });

  it('estimates height from above-ground floors when measured height is zero', () => {
    expect(resolveBuildingHeight(0, 5)).toEqual({ value: 16, estimated: true });
  });

  it('returns null when height and floors are unavailable', () => {
    expect(resolveBuildingHeight(0, null)).toEqual({ value: null, estimated: false });
  });
});
