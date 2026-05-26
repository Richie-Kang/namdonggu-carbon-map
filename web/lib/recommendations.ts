export type IndustryCategory =
  | 'food'
  | 'office_retail'
  | 'factory'
  | 'residential'
  | 'unknown';

export type ActionCard = {
  id: string;
  title: string;
  description: string;
  estimated_saving_pct: number;
  category: IndustryCategory[];
};

export const ACTIONS: ActionCard[] = [
  {
    id: 'led',
    title: 'LED 조명 교체',
    description: '형광등·할로겐 → LED로 교체 시 조명 전력 50~70% 절감.',
    estimated_saving_pct: 8,
    category: ['food', 'office_retail', 'factory', 'residential', 'unknown'],
  },
  {
    id: 'heat_recovery',
    title: '폐열회수 환기 (ERV)',
    description: '주방·매장 환기열의 60~75%를 회수해 냉난방 부하 절감.',
    estimated_saving_pct: 12,
    category: ['food'],
  },
  {
    id: 'induction',
    title: '인덕션 가스레인지 교체',
    description: '도시가스 → 인덕션. 효율 향상 + 가스 사용량 직접 감소.',
    estimated_saving_pct: 15,
    category: ['food'],
  },
  {
    id: 'rooftop_solar',
    title: '옥상 태양광 패널',
    description: '옥상 면적 활용. 주간 자가소비 + 잉여 판매. 평균 회수기간 7년.',
    estimated_saving_pct: 20,
    category: ['office_retail', 'factory', 'residential'],
  },
  {
    id: 'hvac_efficient',
    title: '고효율 공조 시스템',
    description: '인버터 EHP/터보냉동기로 전환. 부분부하 효율 ↑.',
    estimated_saving_pct: 10,
    category: ['office_retail', 'factory'],
  },
  {
    id: 'waste_heat',
    title: '폐열처리기 / 폐열보일러',
    description: '공정 폐열로 온수·증기 생산. 산업단지 가스 사용 절감.',
    estimated_saving_pct: 18,
    category: ['factory'],
  },
  {
    id: 'inverter_motor',
    title: '인버터 동력 모터',
    description: '동력기기를 인버터 제어로 전환. 부하 변동 시 30%+ 절감.',
    estimated_saving_pct: 10,
    category: ['factory'],
  },
  {
    id: 'balcony_solar',
    title: '베란다형 태양광',
    description: '가정용 미니 태양광. 월 평균 ~10kWh 자가소비.',
    estimated_saving_pct: 5,
    category: ['residential'],
  },
  {
    id: 'insulation',
    title: '단열·창호 개선',
    description: '단열재·이중창 보강으로 난방·냉방 부하 감소.',
    estimated_saving_pct: 12,
    category: ['residential', 'unknown'],
  },
];

export function categorizeByUseCode(useCode?: string | null, industryCode?: string | null): IndustryCategory {
  // reason: 건축물대장 주용도코드 첫 두 자리는 대분류. 01:주거, 02:공동주택, 03:1종근린생활,
  //         04:2종근린생활, 14:업무, 17:공장, 18:창고 등.
  const code = (useCode ?? '').slice(0, 2);
  if (code === '01' || code === '02') return 'residential';
  if (code === '03' || code === '04') {
    // 근린생활: 산업분류로 음식점/카페 식별
    const ksic = (industryCode ?? '').slice(0, 2);
    if (ksic === '56' /* 음식점·주점업 */) return 'food';
    return 'office_retail';
  }
  if (code === '14' || code === '15') return 'office_retail';
  if (code === '17' || code === '18') return 'factory';
  return 'unknown';
}

export function recommendActions(useCode?: string | null, industryCode?: string | null): ActionCard[] {
  const category = categorizeByUseCode(useCode, industryCode);
  return ACTIONS.filter((a) => a.category.includes(category)).slice(0, 3);
}
