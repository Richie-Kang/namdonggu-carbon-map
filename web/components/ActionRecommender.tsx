'use client';

import { recommendActions } from '@/lib/recommendations';

export function ActionRecommender({
  useMainCode,
  industryCode,
}: {
  useMainCode: string | null;
  industryCode: string | null;
}) {
  const actions = recommendActions(useMainCode, industryCode);
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold mb-1">탄소절감 추천 액션</h3>
      <ul className="space-y-2">
        {actions.map((a) => (
          <li key={a.id} className="rounded border border-slate-200 p-2">
            <div className="flex items-center justify-between">
              <strong className="text-sm">{a.title}</strong>
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800">
                ~{a.estimated_saving_pct}% 절감
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">{a.description}</p>
          </li>
        ))}
        {actions.length === 0 && (
          <li className="text-xs text-slate-500">분류 정보 부족 — 일반 가이드 적용</li>
        )}
      </ul>
    </div>
  );
}
