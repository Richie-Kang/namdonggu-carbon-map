'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store';

type Hit = {
  building_id: string;
  pnu: string | null;
  name: string | null;
  address_jibun: string | null;
  address_road: string | null;
  use_main: string | null;
  co2_kg_month: number | null;
  lon: number;
  lat: number;
};

export function SearchBox({ onFly }: { onFly: (lon: number, lat: number) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const setSelected = useAppStore((s) => s.setSelected);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}&limit=12`);
        if (!r.ok) {
          if (!cancelled) setHits([]);
          return;
        }
        const data = (await r.json()) as { results: Hit[] };
        if (!cancelled) {
          setHits(data.results ?? []);
          setOpen(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(h: Hit) {
    setSelected({
      building_id: h.building_id,
      pnu: h.pnu,
      name: h.name,
      use_main: h.use_main,
      co2_kg_month: h.co2_kg_month,
    });
    onFly(h.lon, h.lat);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 shadow-lg ring-1 ring-black/10">
        <svg
          className="h-4 w-4 shrink-0 text-slate-400"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
            clipRule="evenodd"
          />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => hits.length && setOpen(true)}
          placeholder="지번 · 도로명 · 상호명 검색"
          aria-label="검색"
          className="w-64 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
        />
        {loading && (
          <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
        )}
      </div>
      {open && (hits.length > 0 || loading) && (
        <ul className="absolute left-0 right-0 top-full mt-1.5 max-h-96 overflow-auto rounded-xl bg-white shadow-lg ring-1 ring-black/10">
          {loading && <li className="px-3 py-2 text-xs text-slate-400">검색 중…</li>}
          {hits.map((h) => (
            <li key={h.building_id}>
              <button
                onClick={() => pick(h)}
                className="block w-full px-3 py-2.5 text-left hover:bg-slate-50"
              >
                <div className="truncate text-sm font-medium text-slate-800">
                  {h.name ?? h.address_jibun ?? h.pnu ?? h.building_id}
                </div>
                <div className="truncate text-[11px] text-slate-500">
                  {h.address_road || h.address_jibun || '주소 미상'}
                  {h.use_main ? ` · ${h.use_main}` : ''}
                </div>
              </button>
            </li>
          ))}
          {!loading && hits.length === 0 && (
            <li className="px-3 py-2 text-xs text-slate-400">결과 없음</li>
          )}
        </ul>
      )}
    </div>
  );
}
