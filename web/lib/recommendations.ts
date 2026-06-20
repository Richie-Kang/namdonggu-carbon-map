export type IndustryCategory =
  | 'food'
  | 'manufacturing_high_heat'
  | 'manufacturing_motor'
  | 'manufacturing_general'
  | 'logistics'
  | 'office_retail'
  | 'factory'
  | 'residential'
  | 'unknown';

export type ActionCard = {
  id: string;
  title: string;
  description: string;
  estimated_saving_pct: number | null;
  investment_range_krw: [number, number] | null;
  category: IndustryCategory[];
  providerCategory?: 'solar' | 'efficiency';
  supportPrograms?: ActionSupportProgram[];
  calculationMode:
    | 'default_percent'
    | 'rooftop_solar_area'
    | 'led_area_estimate'
    | 'hvac_area_estimate'
    | 'area_energy_proxy_estimate';
};

export type ActionSupportProgram = {
  title: string;
  organization: string;
  url: string;
  status: string;
};

export const ACTIONS: ActionCard[] = [
  {
    id: 'led',
    title: 'LED 조명 교체',
    description: '형광등·할로겐 → LED로 교체. 조명 전력은 50% 내외 절감, 전체 절감률은 조명 비중에 따라 변동.',
    estimated_saving_pct: 5,
    investment_range_krw: null,
    category: ['food', 'manufacturing_high_heat', 'manufacturing_motor', 'manufacturing_general', 'logistics', 'office_retail', 'factory', 'residential', 'unknown'],
    calculationMode: 'led_area_estimate',
  },
  {
    id: 'heat_recovery',
    title: '폐열회수 환기 (ERV)',
    description: '주방·매장 환기열 회수로 냉난방·가스 부하를 줄이는 설비.',
    estimated_saving_pct: 8,
    investment_range_krw: null,
    category: ['food'],
    calculationMode: 'area_energy_proxy_estimate',
  },
  {
    id: 'induction',
    title: '인덕션 가스레인지 교체',
    description: '가스 화구를 인덕션으로 전환해 조리 효율을 높이고 배기 부하를 줄이는 방식.',
    estimated_saving_pct: 10,
    investment_range_krw: null,
    category: ['food'],
    calculationMode: 'area_energy_proxy_estimate',
  },
  {
    id: 'rooftop_solar',
    title: '옥상 태양광 패널',
    description: '옥상 면적 기준 설치비와 발전 판매 가치를 산정. 한전 직계약으로 발전량 판매.',
    estimated_saving_pct: 20,
    investment_range_krw: [120_000_000, 120_000_000],
    category: ['food', 'manufacturing_high_heat', 'manufacturing_motor', 'manufacturing_general', 'logistics', 'office_retail', 'factory', 'residential', 'unknown'],
    providerCategory: 'solar',
    calculationMode: 'rooftop_solar_area',
    supportPrograms: [
      {
        title: '신재생에너지 보급사업 확인',
        organization: '한국에너지공단 신재생에너지센터',
        url: 'https://www.knrec.or.kr/biz/intro.do',
        status: '공식 사업 안내',
      },
    ],
  },
  {
    id: 'hvac_efficient',
    title: '고효율 공조 시스템',
    description: '인버터 EHP/터보냉동기 전환. 투자비는 면적 기반 참고치, BEP는 공조 전력 비중 확인 필요.',
    estimated_saving_pct: 10,
    investment_range_krw: null,
    category: ['food', 'manufacturing_general', 'logistics', 'office_retail', 'factory'],
    calculationMode: 'hvac_area_estimate',
  },
  {
    id: 'waste_heat',
    title: '폐열처리기 / 폐열보일러',
    description: '공정 폐열로 온수·증기 예열을 수행해 연료 사용량을 줄이는 설비.',
    estimated_saving_pct: 12,
    investment_range_krw: null,
    category: ['manufacturing_high_heat', 'factory'],
    calculationMode: 'area_energy_proxy_estimate',
  },
  {
    id: 'inverter_motor',
    title: '인버터 동력 모터',
    description: '팬·펌프·컴프레서 모터를 인버터 제어로 전환해 부분부하 전력을 줄이는 방식.',
    estimated_saving_pct: 8,
    investment_range_krw: null,
    category: ['manufacturing_motor', 'manufacturing_general', 'logistics', 'factory'],
    calculationMode: 'area_energy_proxy_estimate',
  },
  {
    id: 'balcony_solar',
    title: '베란다형 태양광',
    description: '가정용 미니 태양광. 월 평균 ~10kWh 자가소비.',
    estimated_saving_pct: 5,
    investment_range_krw: [600_000, 1_500_000],
    category: ['residential'],
    calculationMode: 'default_percent',
  },
  {
    id: 'insulation',
    title: '단열·창호 개선',
    description: '단열재·창호 보강으로 난방·냉방 손실을 줄이는 외피 개선.',
    estimated_saving_pct: 7,
    investment_range_krw: null,
    category: ['residential', 'unknown'],
    calculationMode: 'area_energy_proxy_estimate',
  },
];

export function categorizeByUseCode(useCode?: string | null, industryCode?: string | null): IndustryCategory {
  const industryCategory = categorizeByIndustryCode(industryCode);
  if (industryCategory !== 'unknown') return industryCategory;

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
  return recommendActionsForCategory(category);
}

export function categorizeByIndustryCode(industryCode?: string | null): IndustryCategory {
  const code = (industryCode ?? '').replace(/^[A-Za-z]+/, '').replace(/\D/g, '');
  const two = code.slice(0, 2);
  const three = code.slice(0, 3);
  if (!two) return 'unknown';

  // KSIC 10~12 food/beverage/tobacco, 56 food service.
  if (['10', '11', '12', '56'].includes(two)) return 'food';
  // Heat/fuel intensive manufacturing: textile, pulp/paper, chemical,
  // rubber/plastic, non-metal mineral, metal, refining.
  if (['13', '17', '19', '20', '22', '23', '24', '25'].includes(two)) {
    return 'manufacturing_high_heat';
  }
  // Machinery/electronics/auto manufacturers tend to have fan, pump, compressor,
  // and production motor loads where VFD control is a practical first candidate.
  if (['26', '27', '28', '29', '30', '31', '32', '33'].includes(two)) {
    return 'manufacturing_motor';
  }
  if (['14', '15', '16', '18', '21'].includes(two)) return 'manufacturing_general';
  if (['49', '50', '51', '52'].includes(two) || three === '521') return 'logistics';
  if (['45', '46', '47', '55', '58', '59', '60', '61', '62', '63', '64', '65', '66', '68', '69', '70', '71', '72', '73', '74', '75'].includes(two)) {
    return 'office_retail';
  }
  return 'unknown';
}

export function recommendActionsForCategory(category: IndustryCategory): ActionCard[] {
  const solar = findActionById('rooftop_solar');
  const candidates = ACTIONS.filter((action) => action.id !== 'rooftop_solar' && action.category.includes(category));
  const fallback = ACTIONS.filter((action) =>
    action.id !== 'rooftop_solar' &&
    ['led', 'hvac_efficient', 'inverter_motor', 'insulation'].includes(action.id),
  );
  const picked: ActionCard[] = [];
  if (solar) picked.push(solar);
  for (const action of [...candidates, ...fallback]) {
    if (picked.length >= 3) break;
    if (!picked.some((item) => item.id === action.id)) picked.push(action);
  }
  return picked;
}

export function recommendActionsForIndustryCodes(
  useCode?: string | null,
  industryCodes: Array<string | null | undefined> = [],
): ActionCard[] {
  const category = industryCodes
    .map((code) => categorizeByIndustryCode(code))
    .find((item) => item !== 'unknown') ?? categorizeByUseCode(useCode, null);
  return recommendActionsForCategory(category);
}

export function findActionById(id?: string | null): ActionCard | null {
  if (!id) return null;
  return ACTIONS.find((a) => a.id === id) ?? null;
}

export function findActionByTitle(title?: string | null): ActionCard | null {
  if (!title) return null;
  return ACTIONS.find((a) => a.title === title) ?? null;
}
