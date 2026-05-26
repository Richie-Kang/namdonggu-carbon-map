import { describe, it, expect } from 'vitest';
import { recommendActions, categorizeByUseCode } from '@/lib/recommendations';

describe('recommendations', () => {
  it('categorizes residential', () => {
    expect(categorizeByUseCode('01000')).toBe('residential');
    expect(categorizeByUseCode('02100')).toBe('residential');
  });

  it('categorizes factory', () => {
    expect(categorizeByUseCode('17000')).toBe('factory');
  });

  it('uses KSIC for 음식점', () => {
    expect(categorizeByUseCode('03000', '56110')).toBe('food');
  });

  it('returns at least one card for every common category', () => {
    for (const code of ['01000', '02100', '03000', '14000', '17000', '99999']) {
      const r = recommendActions(code, null);
      expect(r.length).toBeGreaterThan(0);
    }
  });

  it('limits to 3', () => {
    const r = recommendActions('17000', null);
    expect(r.length).toBeLessThanOrEqual(3);
  });
});
