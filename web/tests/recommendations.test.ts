import { describe, it, expect } from 'vitest';
import {
  categorizeByIndustryCode,
  categorizeByUseCode,
  findActionById,
  recommendActions,
  recommendActionsForIndustryCodes,
} from '@/lib/recommendations';
import { normalizeKoreanLocalPhone, providersForAction } from '@/lib/action-providers';
import { smsHref, telHref } from '@/lib/phone-links';

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

  it('keeps rooftop solar fixed and varies two actions by parcel industries', () => {
    expect(recommendActionsForIndustryCodes('17000', ['10110']).map((action) => action.id)).toEqual([
      'rooftop_solar',
      'led',
      'heat_recovery',
    ]);
    expect(recommendActionsForIndustryCodes('17000', ['25110']).map((action) => action.id)).toEqual([
      'rooftop_solar',
      'led',
      'waste_heat',
    ]);
    expect(recommendActionsForIndustryCodes('17000', ['28110']).map((action) => action.id)).toEqual([
      'rooftop_solar',
      'led',
      'inverter_motor',
    ]);
  });

  it('categorizes KSIC industry codes before building use fallback', () => {
    expect(categorizeByIndustryCode('56110')).toBe('food');
    expect(categorizeByIndustryCode('25110')).toBe('manufacturing_high_heat');
    expect(categorizeByIndustryCode('28110')).toBe('manufacturing_motor');
    expect(categorizeByIndustryCode('52101')).toBe('logistics');
  });

  it('connects rooftop solar to a real provider and support link', () => {
    const action = findActionById('rooftop_solar');

    expect(action?.providerCategory).toBe('solar');
    expect(action?.supportPrograms?.[0]?.url).toContain('knrec.or.kr');
    expect(providersForAction('rooftop_solar')[0]?.phone).toBe('02-889-9941');
  });

  it('keeps provider phone links in Korean local format', () => {
    expect(normalizeKoreanLocalPhone('02-889-9941')).toBe('02-889-9941');
    expect(normalizeKoreanLocalPhone('+82-2-889-9941')).toBe('02-889-9941');
    expect(normalizeKoreanLocalPhone('82-2-889-9941')).toBe('02-889-9941');
    expect(telHref('+82-2-889-9941')).toBe('tel:02-889-9941');
    expect(smsHref('+82-2-889-9941', '문의')).toBe('sms://02-889-9941?body=%EB%AC%B8%EC%9D%98');
  });

  it('does not keep hard-coded costs for non-solar actions that need estimation', () => {
    expect(findActionById('led')?.calculationMode).toBe('led_area_estimate');
    expect(findActionById('led')?.investment_range_krw).toBeNull();
    expect(findActionById('hvac_efficient')?.calculationMode).toBe('hvac_area_estimate');
    expect(findActionById('hvac_efficient')?.investment_range_krw).toBeNull();
    expect(findActionById('waste_heat')?.calculationMode).toBe('area_energy_proxy_estimate');
    expect(findActionById('waste_heat')?.estimated_saving_pct).toBe(12);
  });
});
