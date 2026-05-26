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
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        placeholder="지번 · 도로명 · 상호명 검색"
        aria-label="검색"
        className="w-72 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
      />
      {open && (hits.length > 0 || loading) && (
        <ul className="absolute left-0 right-0 top-full mt-1 max-h-96 overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg">
          {loading && <li className="px-3 py-2 text-xs text-slate-500">검색 중…</li>}
          {hits.map((h) => (
            <li key={h.building_id}>
              <button
                onClick={() => pick(h)}
                className="block w-full px-3 py-2 text-left hover:bg-slate-50"
              >
                <div className="truncate font-medium">
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
            <li className="px-3 py-2 text-xs text-slate-500">결과 없음</li>
          )}
        </ul>
      )}
    </div>
  );
}
