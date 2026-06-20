'use client';

import { useMemo, useState } from 'react';
import type { ActionCard } from '@/lib/recommendations';
import { estimateActionEconomics, type ActionEconomicsInput } from '@/lib/action-economics';
import { providersForAction } from '@/lib/action-providers';
import { smsHref, telHref } from '@/lib/phone-links';
import { estimateRooftopSolarEconomics } from '@/lib/solar-economics';

const QUICK_VISIT_TIMES = [
  '가장 빠른 가능 일정',
  '이번 주 오전',
  '이번 주 오후',
  '다음 주 오전',
  '다음 주 오후',
] as const;

function krw(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '예상치 없음';
  if (value >= 100_000_000) return `${(value / 100_000_000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억원`;
  if (value >= 10_000) return `${Math.round(value / 10_000).toLocaleString('ko-KR')}만원`;
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function numeric(value: unknown): string {
  if (value == null) return '예상치 없음';
  const n = Number(value);
  if (!Number.isFinite(n)) return '예상치 없음';
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
}

function krwRange(value: [number, number] | null): string {
  if (!value) return '예상치 없음';
  if (value[0] === value[1]) return krw(value[0]);
  return `${krw(value[0])}~${krw(value[1])}`;
}

function bepRange(value: [number, number] | null): string {
  if (!value) return '예상치 없음';
  const toYears = (months: number) => Math.round((months / 12) * 10) / 10;
  const low = toYears(value[0]);
  const high = toYears(value[1]);
  if (low === high) return `약 ${low.toLocaleString('ko-KR')}년`;
  return `약 ${low.toLocaleString('ko-KR')}~${high.toLocaleString('ko-KR')}년`;
}

function formatDateTime(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function buildingName(building?: Record<string, unknown>): string {
  return (
    textValue(building?.name) ??
    textValue(building?.address_road) ??
    textValue(building?.address_jibun) ??
    '선택 건물'
  );
}

function buildingAddress(building?: Record<string, unknown>): string {
  return textValue(building?.address_road) ?? textValue(building?.address_jibun) ?? '주소 미상';
}

function sourceLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '출처';
  }
}

export function ActionEngagement({
  action,
  building,
  energyInput,
}: {
  action: ActionCard;
  building?: Record<string, unknown>;
  energyInput?: ActionEconomicsInput;
}) {
  const [visitPreset, setVisitPreset] = useState<string>(QUICK_VISIT_TIMES[0]);
  const [customDateTime, setCustomDateTime] = useState('');
  const providers = providersForAction(action.id);
  const hasSupportPrograms = Boolean(action.supportPrograms?.length);
  const visitTime = formatDateTime(customDateTime) ?? visitPreset;
  const targetName = buildingName(building);
  const targetAddress = buildingAddress(building);
  const inquiryBody = [
    `남동구 탄소지도에서 ${targetName}의 ${action.title} 현장방문 상담을 요청합니다.`,
    `주소: ${targetAddress}`,
    `희망 일정: ${visitTime}`,
  ].join('\n');

  const solarEconomics = useMemo(() => {
    if (action.calculationMode !== 'rooftop_solar_area') return null;
    return estimateRooftopSolarEconomics({
      area_total: building?.area_total,
      floors_above: building?.floors_above,
    });
  }, [action.calculationMode, building]);

  const nonSolarEconomics = useMemo(() => {
    if (action.calculationMode === 'rooftop_solar_area') return null;
    return estimateActionEconomics(
      action,
      energyInput ?? {
        electricity_kwh_month: null,
        gas_m3_month: null,
        co2_kg_month: null,
      },
      building,
    );
  }, [action, building, energyInput]);

  if (!solarEconomics && !nonSolarEconomics && providers.length === 0 && !hasSupportPrograms) return null;

  return (
    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
      {solarEconomics && (
        <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-slate-700">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <span className="text-slate-500">추정 옥상면적</span>
            <strong className="text-right font-semibold">{numeric(solarEconomics.roof_area_m2)} ㎡</strong>
            <span className="text-slate-500">예상 설치비</span>
            <strong className="text-right font-semibold">{krw(solarEconomics.install_cost_krw)}</strong>
            <span className="text-slate-500">연간 생산·판매 가치</span>
            <strong className="text-right font-semibold">{krw(solarEconomics.annual_value_krw)}</strong>
            <span className="text-slate-500">예상 회수기간</span>
            <strong className="text-right font-semibold">
              {solarEconomics.payback_years != null ? `약 ${solarEconomics.payback_years}년` : '예상치 없음'}
            </strong>
          </div>
          <p className="mt-2 leading-relaxed text-slate-500">
            985㎡ 기준 설치비 1.2억원, 연간 생산·판매 가치 4천만원을 면적 비례로 환산했습니다.
            한전 직계약 발전량 판매와 에너지공단 혜택 포함 추정입니다.
          </p>
          {solarEconomics.basis === 'area_total_fallback' && (
            <p className="mt-1 text-slate-400">지상층수 데이터가 없어 연면적 기준으로 추정했습니다.</p>
          )}
        </div>
      )}

      {nonSolarEconomics && (
        <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-700">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <span className="text-slate-500">예상 투자비</span>
            <strong className="text-right font-semibold">{krwRange(nonSolarEconomics.investment_range_krw)}</strong>
            <span className="text-slate-500">월 비용절감</span>
            <strong className="text-right font-semibold">{krw(nonSolarEconomics.estimated_monthly_cost_saving_krw)}</strong>
            <span className="text-slate-500">월 탄소절감</span>
            <strong className="text-right font-semibold">
              {nonSolarEconomics.estimated_monthly_co2_saving_kg != null
                ? `${nonSolarEconomics.estimated_monthly_co2_saving_kg.toLocaleString('ko-KR')} kg`
                : '예상치 없음'}
            </strong>
            <span className="text-slate-500">BEP</span>
            <strong className="text-right font-semibold">{bepRange(nonSolarEconomics.bep_months_range)}</strong>
          </div>
          {nonSolarEconomics.estimate_note && (
            <p className="mt-2 leading-relaxed text-slate-500">{nonSolarEconomics.estimate_note}</p>
          )}
        </div>
      )}

      {providers.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500">현장방문 희망 일정</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_VISIT_TIMES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setVisitPreset(option);
                  setCustomDateTime('');
                }}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  visitTime === option
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <input
            type="datetime-local"
            value={customDateTime}
            onChange={(event) => setCustomDateTime(event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 outline-none focus:border-slate-400"
            aria-label="현장방문 희망 날짜와 시간"
          />
        </div>
      )}

      {providers.length > 0 ? (
        <div className="space-y-2">
          {providers.map((provider) => (
            <div key={provider.id} className="rounded-lg bg-slate-50 px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{provider.name}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{provider.note}</p>
                  <a
                    href={provider.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-[11px] text-slate-400 underline underline-offset-2 hover:text-slate-600"
                  >
                    출처: {sourceLabel(provider.sourceUrl)}
                  </a>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">
                  {provider.phone}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <a
                  href={telHref(provider.phone)}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-slate-700"
                >
                  전화하기
                </a>
                <a
                  href={smsHref(provider.phone, inquiryBody)}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  문자 문의
                </a>
              </div>
              <a
                href={provider.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                업체 페이지 보기
              </a>
            </div>
          ))}
        </div>
      ) : null}

      {action.supportPrograms && action.supportPrograms.length > 0 && (
        <div className="space-y-1.5">
          {action.supportPrograms.map((program) => (
            <a
              key={`${program.organization}-${program.title}`}
              href={program.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              {program.title} · {program.organization}
              <span className="ml-1 font-normal text-emerald-600">({program.status})</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
