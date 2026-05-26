'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';

type Pair = { electricity_kwh: number; gas_m3: number };

export function SimulationChart({ current, sim }: { current: Pair; sim?: Pair }) {
  const data = [
    {
      label: '전기 (kWh)',
      현재: Math.round(current.electricity_kwh),
      시뮬: sim ? Math.round(sim.electricity_kwh) : null,
    },
    {
      label: '가스 (m³)',
      현재: Math.round(current.gas_m3),
      시뮬: sim ? Math.round(sim.gas_m3) : null,
    },
  ];
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip formatter={(v: number) => v.toLocaleString('ko-KR')} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="현재" fill="#64748b" radius={[3, 3, 0, 0]} />
          <Bar dataKey="시뮬" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
