/**
 * KSIC(한국표준산업분류) 대분류 기준 CO2 배출 승수.
 * 기준 1.0 = 일반 상업·서비스(도소매, 사무).
 * 근거: 산업통상자원부 「업종별 에너지 소비 통계」2022 + 온실가스종합정보센터 공정 배출.
 */

export type IndustryMultiplierEntry = {
  label: string;
  multiplier: number;
  hasSmokestack: boolean;
};

// key: KSIC 2자리 대분류 코드 (숫자 문자열)
const MULTIPLIERS: Record<string, IndustryMultiplierEntry> = {
  '19': { label: '석유 정제',       multiplier: 2.8, hasSmokestack: true  },
  '20': { label: '화학·화학제품',   multiplier: 2.5, hasSmokestack: true  },
  '23': { label: '비금속 광물',     multiplier: 2.0, hasSmokestack: true  },
  '24': { label: '1차 금속(철강)',  multiplier: 3.5, hasSmokestack: true  },
  '25': { label: '금속 가공',       multiplier: 1.8, hasSmokestack: true  },
  '35': { label: '전기·가스 공급',  multiplier: 2.0, hasSmokestack: true  },
  '22': { label: '고무·플라스틱',   multiplier: 1.6, hasSmokestack: false },
  '26': { label: '전자·반도체',     multiplier: 1.5, hasSmokestack: false },
  '28': { label: '기계 장비',       multiplier: 1.4, hasSmokestack: false },
  '29': { label: '자동차·트레일러', multiplier: 1.4, hasSmokestack: false },
  '10': { label: '식품 제조',       multiplier: 1.3, hasSmokestack: false },
  '11': { label: '음료 제조',       multiplier: 1.2, hasSmokestack: false },
};

// 제조업 전체(10–33) 미분류 시 사용하는 기본 배율
const MANUFACTURING_DEFAULT: IndustryMultiplierEntry = {
  label: '제조업(기타)',
  multiplier: 1.3,
  hasSmokestack: false,
};

const DEFAULT: IndustryMultiplierEntry = {
  label: '일반',
  multiplier: 1.0,
  hasSmokestack: false,
};

/**
 * industry_code는 KSIC 다양한 형식 허용: '24101', 'C24', '24', '56' 등.
 * - 선행 영문자 제거
 * - 첫 2자리 숫자로 대분류 매칭
 */
export function getIndustryMultiplier(
  industry_code: string | null | undefined,
): IndustryMultiplierEntry {
  if (!industry_code) return DEFAULT;
  const digits = industry_code.replace(/^[A-Za-z]+/, '').replace(/\D/g, '');
  const prefix = digits.slice(0, 2);
  if (MULTIPLIERS[prefix]) return MULTIPLIERS[prefix];
  const major = parseInt(prefix, 10);
  if (major >= 10 && major <= 33) return MANUFACTURING_DEFAULT;
  return DEFAULT;
}
