'use client';

const STOPS = [
  { q: 1, c: '#16a34a', label: '저' },
  { q: 2, c: '#84cc16', label: '' },
  { q: 3, c: '#eab308', label: '중' },
  { q: 4, c: '#f97316', label: '' },
  { q: 5, c: '#dc2626', label: '고' },
];

export function Legend({ zoom, buildingMinZoom }: { zoom: number; buildingMinZoom: number }) {
  const mode = zoom >= buildingMinZoom ? '건물 단위' : '100m 격자 단위';
  return (
    <div className="absolute bottom-4 left-4 z-10 rounded-lg bg-white/95 px-4 py-2 text-xs shadow">
      <div className="mb-1 font-semibold">CO₂ {mode}</div>
      <div className="flex items-center gap-1">
        {STOPS.map((s) => (
          <div key={s.q} className="flex flex-col items-center">
            <div className="h-4 w-8" style={{ backgroundColor: s.c }} />
            {s.label && <div className="text-[10px] text-slate-600">{s.label}</div>}
          </div>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-slate-500">추정치 · 정성적 비교용</p>
    </div>
  );
}
