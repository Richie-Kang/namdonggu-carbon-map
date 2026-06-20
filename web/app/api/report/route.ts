import { NextResponse, type NextRequest } from 'next/server';
import { supabasePublic } from '@/lib/supabase';
import { recommendActionsForIndustryCodes } from '@/lib/recommendations';
import { BuildingId, ReportResponse as ReportResponseSchema, type ReportResponse } from '@/lib/zod-schemas';
import { ENERGY_PRICE_KRW, estimateActionEconomics } from '@/lib/action-economics';
import { electricityKwhFromCo2 } from '@/lib/emission-factors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type EnergyRow = {
  yyyymm?: string;
  electricity_kwh?: number;
  gas_m3?: number;
  co2_kg?: number;
};

type Business = {
  name?: string;
  industry_code?: string;
  industry_name?: string;
};

type Factory = {
  name?: string;
  industry_code?: string;
  industry_name?: string;
  employees?: number;
};

type BuildingDetail = {
  building?: Record<string, unknown>;
  energy?: EnergyRow[];
  businesses?: Business[];
  factories?: Factory[];
  error?: string;
};

const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'industry_reasoning', 'priority_actions', 'caveats'],
  properties: {
    summary: { type: 'string' },
    industry_reasoning: {
      type: 'array',
      minItems: 1,
      items: { type: 'string' },
    },
    priority_actions: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'action_id',
          'title',
          'why_priority',
          'estimated_saving_pct',
          'estimated_monthly_cost_saving_krw',
          'estimated_monthly_co2_saving_kg',
          'investment_range_krw',
          'bep_months_range',
          'estimate_note',
        ],
        properties: {
          action_id: { type: 'string' },
          title: { type: 'string' },
          why_priority: { type: 'string' },
          estimated_saving_pct: { type: ['number', 'null'] },
          estimated_monthly_cost_saving_krw: { type: ['number', 'null'] },
          estimated_monthly_co2_saving_kg: { type: ['number', 'null'] },
          investment_range_krw: {
            anyOf: [
              { type: 'null' },
              {
                type: 'array',
                minItems: 2,
                maxItems: 2,
                items: { type: 'number' },
              },
            ],
          },
          bep_months_range: {
            anyOf: [
              { type: 'null' },
              {
                type: 'array',
                minItems: 2,
                maxItems: 2,
                items: { type: 'number' },
              },
            ],
          },
          estimate_note: { type: ['string', 'null'] },
        },
      },
    },
    caveats: {
      type: 'array',
      minItems: 1,
      items: { type: 'string' },
    },
  },
} as const;

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function average(rows: EnergyRow[], key: keyof EnergyRow): number | null {
  const values = rows.map((r) => numberOrNull(r[key])).filter((v): v is number => v != null);
  if (!values.length) return null;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function extractOpenAIText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  if (typeof root.output_text === 'string') return root.output_text;

  const output = root.output;
  if (!Array.isArray(output)) return null;
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === 'string') chunks.push(text);
    }
  }
  return chunks.length ? chunks.join('\n') : null;
}

async function fetchBuildingDetail(buildingId: string): Promise<BuildingDetail | null> {
  const { data, error } = await supabasePublic.rpc('get_building_detail', {
    p_building_id: buildingId,
  });
  if (error) throw new Error(error.message);
  if (
    data &&
    typeof data === 'object' &&
    'error' in data &&
    (data as { error: string }).error === 'not_found'
  ) {
    return null;
  }
  return data as BuildingDetail;
}

function buildReportInput(buildingId: string, detail: BuildingDetail) {
  const building = detail.building ?? {};
  const businesses = detail.businesses ?? [];
  const factories = detail.factories ?? [];
  const energy = detail.energy ?? [];
  const firstBusiness = businesses[0];
  const firstFactory = factories[0];
  const useMainCode = textOrNull(building.use_main_code);
  const industryCode = firstFactory?.industry_code ?? firstBusiness?.industry_code ?? null;
  const co2Month = numberOrNull(building.co2_kg_month) ?? average(energy, 'co2_kg');
  const electricityMonth = average(energy, 'electricity_kwh');
  const gasMonth = average(energy, 'gas_m3');
  const currentEnergy = {
    electricity_kwh_month: electricityMonth ?? (co2Month != null ? electricityKwhFromCo2(co2Month) : null),
    gas_m3_month: gasMonth,
    co2_kg_month: co2Month,
  };
  const industryCodes = [
    ...factories.map((factory) => factory.industry_code),
    ...businesses.map((business) => business.industry_code),
  ];
  const actions = recommendActionsForIndustryCodes(useMainCode, industryCodes).map((action) => ({
    id: action.id,
    title: action.title,
    description: action.description,
    estimated_saving_pct: action.estimated_saving_pct,
    ...estimateActionEconomics(action, currentEnergy, {
      area_total: building.area_total,
      floors_above: building.floors_above,
    }),
  }));

  return {
    building_id: buildingId,
    building_name: textOrNull(building.name) ?? firstBusiness?.name ?? firstFactory?.name ?? null,
    use_main: textOrNull(building.use_main),
    use_main_code: useMainCode,
    current_co2_kg_month: co2Month,
    current_energy_monthly: currentEnergy,
    energy_price_assumptions_krw: ENERGY_PRICE_KRW,
    businesses: businesses.slice(0, 5).map((b) => ({
      name: b.name ?? null,
      industry_name: b.industry_name ?? null,
      industry_code: b.industry_code ?? null,
    })),
    factories: factories.slice(0, 5).map((f) => ({
      name: f.name ?? null,
      industry_name: f.industry_name ?? null,
      industry_code: f.industry_code ?? null,
      employees: numberOrNull(f.employees),
    })),
    recent_energy: energy.slice(-6).map((row) => ({
      yyyymm: row.yyyymm ?? null,
      electricity_kwh: numberOrNull(row.electricity_kwh),
      gas_m3: numberOrNull(row.gas_m3),
      co2_kg: numberOrNull(row.co2_kg),
    })),
    rule_based_actions: actions,
  };
}

type ReportInput = ReturnType<typeof buildReportInput>;
type ReportActionInput = ReportInput['rule_based_actions'][number];

function formatKrw(value: number | null): string {
  if (value == null) return '예상치 없음';
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억원`;
  if (value >= 10_000) return `${Math.round(value / 10_000).toLocaleString('ko-KR')}만원`;
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function formatRange(value: [number, number] | null, suffix = ''): string {
  if (!value) return '예상치 없음';
  if (value[0] === value[1]) return `${value[0].toLocaleString('ko-KR')}${suffix}`;
  return `${value[0].toLocaleString('ko-KR')}~${value[1].toLocaleString('ko-KR')}${suffix}`;
}

function formatBepYears(value: [number, number] | null): string {
  if (!value) return '예상치 없음';
  const toYears = (months: number) => Math.round((months / 12) * 10) / 10;
  const low = toYears(value[0]);
  const high = toYears(value[1]);
  if (low === high) return `약 ${low.toLocaleString('ko-KR')}년`;
  return `약 ${low.toLocaleString('ko-KR')}~${high.toLocaleString('ko-KR')}년`;
}

function actionWhy(action: ReportActionInput, input: ReportInput): string {
  const industry =
    input.factories[0]?.industry_name ??
    input.businesses[0]?.industry_name ??
    input.use_main ??
    '해당 업종';
  const saving = action.estimated_monthly_cost_saving_krw;
  const bep = action.bep_months_range;
  if (action.id === 'rooftop_solar') {
    const annualValue = saving != null ? saving * 12 : null;
    const investment = action.investment_range_krw?.[0] ?? null;
    return `${industry} 건물의 추정 옥상면적을 기준으로 ${action.description} 예상 설치비는 ${formatKrw(investment)}, 연간 생산·판매 가치는 ${formatKrw(annualValue)}, 회수기간은 ${formatBepYears(bep)}로 추정됩니다.`;
  }
  if (action.investment_range_krw && !saving && !bep) {
    return `${industry} 기준 ${action.description} 예상 투자비는 ${formatRange(action.investment_range_krw, '원')}입니다. ${action.estimate_note ?? ''}`.trim();
  }
  return `${industry} 특성상 ${action.description} ${action.estimated_saving_pct}% 내외 절감이 기대되며, 월 비용절감은 ${formatKrw(saving)}, 투자금 회수기간은 ${formatBepYears(bep)}로 추정됩니다.`;
}

function buildFallbackReport(input: ReportInput): ReportResponse {
  const industry =
    input.factories[0]?.industry_name ??
    input.businesses[0]?.industry_name ??
    input.use_main ??
    '업종 데이터 없음';
  const co2 = input.current_co2_kg_month != null
    ? `${Math.round(input.current_co2_kg_month).toLocaleString('ko-KR')}kg/월`
    : '월 배출량 미상';

  return {
    summary: `${industry} 기준으로 우선순위가 높은 절감 액션을 비용 회수 관점에서 정리했습니다. 현재 배출량은 ${co2}이며, 아래 금액과 BEP는 기본 에너지 단가와 액션별 투자비 가정으로 계산한 추정치입니다.`,
    industry_reasoning: [
      `${industry}에 매칭되는 룰 기반 액션을 우선 적용했습니다.`,
      `전기 단가는 ${ENERGY_PRICE_KRW.electricity_per_kwh.toLocaleString('ko-KR')}원/kWh, 가스 단가는 ${ENERGY_PRICE_KRW.gas_per_m3.toLocaleString('ko-KR')}원/m³로 가정했습니다.`,
    ],
    priority_actions: input.rule_based_actions.map((action) => ({
      action_id: action.id,
      title: action.title,
      why_priority: actionWhy(action, input),
      estimated_saving_pct: action.estimated_saving_pct,
      estimated_monthly_cost_saving_krw: action.estimated_monthly_cost_saving_krw,
      estimated_monthly_co2_saving_kg: action.estimated_monthly_co2_saving_kg,
      investment_range_krw: action.investment_range_krw,
      bep_months_range: action.bep_months_range,
      estimate_note: action.estimate_note,
    })),
    caveats: [
      '실측 설비 용량, 실제 요금제, 운영시간, 시공 견적에 따라 비용과 BEP는 달라질 수 있습니다.',
      '표시된 금액은 건물 면적과 월 에너지 사용량을 기반으로 한 예측 범위입니다.',
    ],
  };
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('building_id') ?? '';
  const parsed = BuildingId.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_building_id' }, { status: 400 });
  }

  const apiKey = process.env.RUNYOUR_API_KEY || process.env.OPENAI_API_KEY;
  let detail: BuildingDetail | null;
  try {
    detail = await fetchBuildingDetail(parsed.data);
  } catch (err) {
    return NextResponse.json(
      { error: 'detail_fetch_failed', reason: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    );
  }
  if (!detail) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const reportInput = buildReportInput(parsed.data, detail);
  const fallback = buildFallbackReport(reportInput);

  if (!apiKey) {
    return NextResponse.json(fallback, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const baseUrl = process.env.RUNYOUR_API_BASE_URL || 'https://api.openai.com/v1';
  const model =
    process.env.RUNYOUR_MODEL || process.env.OPENAI_REPORT_MODEL || 'gpt-4o-mini';
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      instructions: [
        '너는 인천 남동구 탄소지도 플랫폼의 기업 탄소배출 분석가다.',
        '제공된 JSON 데이터만 근거로 한국어 요약 보고서를 작성한다.',
        '면적, 층수 같은 기본 속성 요약은 쓰지 말고 업종과 에너지 사용 특성에 집중한다.',
        '우선 액션은 업종에 기반해 왜 먼저 해야 하는지, 월 비용 절감, 월 탄소 절감, BEP를 중심으로 설명한다.',
        '각 우선 액션의 action_id는 입력 JSON rule_based_actions의 id 값을 그대로 복사한다.',
        '비용, 절감률, BEP는 입력 JSON의 rule_based_actions 값만 사용하고 새 값을 지어내지 않는다.',
        'investment_range_krw 또는 bep_months_range가 null이면 입력 JSON에 없는 금액을 새로 만들지 않는다.',
        'estimate_note는 입력 JSON rule_based_actions의 estimate_note 값을 그대로 복사한다.',
        '모든 비용과 절감량은 추정치이며 단가 가정을 사용했다는 점을 caveats에 명시한다.',
      ].join('\n'),
      input: JSON.stringify(reportInput),
      text: {
        format: {
          type: 'json_schema',
          name: 'carbon_action_report',
          strict: true,
          schema: REPORT_SCHEMA,
        },
      },
      max_output_tokens: 1000,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    return NextResponse.json(fallback, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const payload: unknown = await response.json();
  const text = extractOpenAIText(payload);
  if (!text) {
    return NextResponse.json(fallback, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json(fallback, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const report = ReportResponseSchema.safeParse(json);
  if (!report.success) {
    return NextResponse.json(fallback, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  return NextResponse.json(report.data, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
