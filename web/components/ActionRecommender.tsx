'use client';

import type { ActionEconomicsInput } from '@/lib/action-economics';
import { recommendActionsForIndustryCodes } from '@/lib/recommendations';
import { ActionEngagement } from './ActionEngagement';

export function ActionRecommender({
  useMainCode,
  industryCode,
  industryCodes,
  building,
  energyInput,
}: {
  useMainCode: string | null;
  industryCode: string | null;
  industryCodes?: Array<string | null | undefined>;
  building?: Record<string, unknown>;
  energyInput?: ActionEconomicsInput;
}) {
  const actions = recommendActionsForIndustryCodes(useMainCode, industryCodes ?? [industryCode]);
  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-4 w-1 rounded-full bg-slate-300" />
        <h3 className="text-sm font-semibold text-slate-600">탄소절감 추천 액션</h3>
      </div>
      <ul className="space-y-2">
        {actions.map((a) => (
          <li key={a.id} className="rounded border border-slate-200 p-2">
            <div className="flex items-center justify-between">
              <strong className="text-sm">{a.title}</strong>
              {a.estimated_saving_pct != null && (
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800">
                  ~{a.estimated_saving_pct}% 절감
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-600">{a.description}</p>
            <ActionEngagement action={a} building={building} energyInput={energyInput} />
          </li>
        ))}
        {actions.length === 0 && (
          <li className="text-xs text-slate-500">분류 정보 부족 — 일반 가이드 적용</li>
        )}
      </ul>
    </div>
  );
}
