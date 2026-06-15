import { NextResponse, type NextRequest } from 'next/server';
import { supabasePublic } from '@/lib/supabase';
import { recommendActions } from '@/lib/recommendations';
import { BuildingId, ReportResponse } from '@/lib/zod-schemas';

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
  required: ['summary', 'emission_drivers', 'recommended_actions', 'estimated_impact', 'caveats'],
  properties: {
    summary: { type: 'string' },
    emission_drivers: {
      type: 'array',
      minItems: 1,
      items: { type: 'string' },
    },
    recommended_actions: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'rationale', 'estimated_saving_pct'],
        properties: {
          title: { type: 'string' },
          rationale: { type: 'string' },
          estimated_saving_pct: { type: ['number', 'null'] },
        },
      },
    },
    estimated_impact: { type: 'string' },
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
  const industryCode = firstBusiness?.industry_code ?? firstFactory?.industry_code ?? null;
  const actions = recommendActions(useMainCode, industryCode).map((action) => ({
    title: action.title,
    description: action.description,
    estimated_saving_pct: action.estimated_saving_pct,
  }));

  return {
    building_id: buildingId,
    address: textOrNull(building.address_road) ?? textOrNull(building.address_jibun),
    building_name: textOrNull(building.name) ?? firstBusiness?.name ?? firstFactory?.name ?? null,
    use_main: textOrNull(building.use_main),
    use_main_code: useMainCode,
    area_total_m2: numberOrNull(building.area_total),
    floors_above: numberOrNull(building.floors_above),
    current_co2_kg_month: numberOrNull(building.co2_kg_month),
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

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('building_id') ?? '';
  const parsed = BuildingId.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_building_id' }, { status: 400 });
  }

  const apiKey = process.env.RUNYOUR_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'report_unavailable', reason: 'missing_llm_api_key' },
      { status: 503 }
    );
  }

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

  const baseUrl = process.env.RUNYOUR_API_BASE_URL || 'https://api.openai.com/v1';
  const model =
    process.env.RUNYOUR_MODEL || process.env.OPENAI_REPORT_MODEL || 'gpt-4o-mini';
  const reportInput = buildReportInput(parsed.data, detail);
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
        '규제, 보조금, 비용, 절감률은 입력 데이터나 추천 액션에 없는 내용을 지어내지 않는다.',
        '모든 수치는 추정치임을 caveats에 명시한다.',
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
    const reason = (await response.text()).slice(0, 500);
    return NextResponse.json({ error: 'report_unavailable', reason }, { status: 503 });
  }

  const payload: unknown = await response.json();
  const text = extractOpenAIText(payload);
  if (!text) {
    return NextResponse.json({ error: 'report_unavailable', reason: 'empty_model_output' }, { status: 502 });
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'report_unavailable', reason: 'invalid_json_output' }, { status: 502 });
  }

  const report = ReportResponse.safeParse(json);
  if (!report.success) {
    return NextResponse.json(
      { error: 'report_unavailable', reason: 'invalid_report_schema' },
      { status: 502 }
    );
  }

  return NextResponse.json(report.data, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
