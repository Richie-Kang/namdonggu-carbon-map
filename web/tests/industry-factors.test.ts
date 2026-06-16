import { describe, expect, it } from 'vitest';
import { getIndustryMultiplier } from '@/lib/industry-factors';

describe('industry-factors', () => {
  it('maps KSIC 24 variants to primary metal', () => {
    expect(getIndustryMultiplier('24101')).toMatchObject({ label: '1차 금속(철강)', multiplier: 3.5 });
    expect(getIndustryMultiplier('C24')).toMatchObject({ label: '1차 금속(철강)', multiplier: 3.5 });
    expect(getIndustryMultiplier('24')).toMatchObject({ label: '1차 금속(철강)', multiplier: 3.5 });
  });

  it('uses manufacturing default for uncategorized manufacturing', () => {
    expect(getIndustryMultiplier('33999')).toMatchObject({ label: '제조업(기타)', multiplier: 1.3 });
  });

  it('uses the neutral multiplier for general industries', () => {
    expect(getIndustryMultiplier('56110')).toMatchObject({ label: '일반', multiplier: 1.0 });
  });
});
