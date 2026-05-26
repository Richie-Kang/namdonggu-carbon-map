/**
 * web/lib/use-codes.ts — 건축물 주용도 코드 카탈로그 + 토지용도 카테고리.
 * Mirror of `land_use_lookup` seed (0001 init) so the simulator can render
 * drop-downs without a round-trip.  Keep keys synced when seed changes.
 */

export type LandUseCategory = 'residential' | 'commercial' | 'industrial' | 'public' | 'other';

export const USE_MAIN_CODES: { code: string; ko: string; category: LandUseCategory }[] = [
  { code: '01000', ko: '단독주택', category: 'residential' },
  { code: '01100', ko: '다중주택', category: 'residential' },
  { code: '02000', ko: '공동주택', category: 'residential' },
  { code: '02100', ko: '아파트', category: 'residential' },
  { code: '02200', ko: '연립주택', category: 'residential' },
  { code: '02300', ko: '다세대주택', category: 'residential' },
  { code: '03000', ko: '제1종근린생활시설', category: 'commercial' },
  { code: '04000', ko: '제2종근린생활시설', category: 'commercial' },
  { code: '05000', ko: '문화및집회시설', category: 'public' },
  { code: '07000', ko: '판매시설', category: 'commercial' },
  { code: '08000', ko: '운수시설', category: 'public' },
  { code: '09000', ko: '의료시설', category: 'public' },
  { code: '10000', ko: '교육연구시설', category: 'public' },
  { code: '14000', ko: '업무시설', category: 'commercial' },
  { code: '15000', ko: '숙박시설', category: 'commercial' },
  { code: '17000', ko: '공장', category: 'industrial' },
  { code: '18000', ko: '창고시설', category: 'industrial' },
];

export const LAND_USE_CATEGORIES: { value: LandUseCategory; ko: string }[] = [
  { value: 'residential', ko: '주거' },
  { value: 'commercial', ko: '상업' },
  { value: 'industrial', ko: '산업' },
  { value: 'public', ko: '공공' },
  { value: 'other', ko: '기타' },
];

export function labelForUseCode(code: string | null | undefined): string {
  if (!code) return '—';
  const m = USE_MAIN_CODES.find((x) => x.code === code);
  return m ? `${m.ko}` : code;
}

export function categoryForUseCode(code: string | null | undefined): LandUseCategory {
  if (!code) return 'other';
  return USE_MAIN_CODES.find((x) => x.code === code)?.category ?? 'other';
}
