export type ActionProvider = {
  id: string;
  name: string;
  phone: string;
  websiteUrl: string;
  sourceUrl: string;
  serviceActionIds: string[];
  serviceArea: string;
  note: string;
};

export const ACTION_PROVIDERS: ActionProvider[] = [
  {
    id: 'haezoom',
    name: '해줌',
    phone: '02-889-9941',
    websiteUrl: 'https://www.haezoom.com/',
    sourceUrl: 'https://www.haezoom.com/',
    serviceActionIds: ['rooftop_solar'],
    serviceArea: '전국 기업 지붕·옥상 태양광 상담',
    note: '기업 전기요금 절감, 태양광 설치, VPP 서비스를 운영하는 태양광 전문 업체',
  },
];

export function providersForAction(actionId: string): ActionProvider[] {
  return ACTION_PROVIDERS.filter((provider) => provider.serviceActionIds.includes(actionId));
}

export function normalizeKoreanLocalPhone(phone: string): string {
  const compact = phone.trim().replace(/\s+/g, '');
  if (compact.startsWith('+82')) {
    const national = compact.replace(/^\+82-?/, '').replace(/^0/, '');
    return `0${national}`;
  }
  if (/^82-?/.test(compact)) {
    const national = compact.replace(/^82-?/, '').replace(/^0/, '');
    return `0${national}`;
  }
  return compact;
}
