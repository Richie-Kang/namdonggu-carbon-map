import { describe, it, expect } from 'vitest';
import { quintileRGBA, quintileOfValue } from '@/lib/colors';

describe('colors', () => {
  it('returns 5 distinct colors', () => {
    const seen = new Set(
      [1, 2, 3, 4, 5].map((q) => quintileRGBA(q).slice(0, 3).join(','))
    );
    expect(seen.size).toBe(5);
  });

  it('falls back for unknown quintile', () => {
    const c = quintileRGBA(null);
    expect(c).toHaveLength(4);
    expect(c[3]).toBeLessThanOrEqual(80);
  });

  it('quantile splits', () => {
    const bp: [number, number, number, number] = [10, 20, 30, 40];
    expect(quintileOfValue(5, bp)).toBe(1);
    expect(quintileOfValue(35, bp)).toBe(4);
    expect(quintileOfValue(100, bp)).toBe(5);
  });
});
