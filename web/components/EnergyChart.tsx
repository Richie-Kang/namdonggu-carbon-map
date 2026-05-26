'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

type Row = { yyyymm: string; electricity_kwh: number; gas_m3: number; co2_kg: number };

export function EnergyChart({ data }: { data: Row[] }) {
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <XAxis dataKey="yyyymm" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip formatter={(v: number) => v.toLocaleString('ko-KR', { maximumFractionDigits: 1 })} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar dataKey="electricity_kwh" name="전기(kWh)" fill="#0ea5e9" />
          <Bar dataKey="gas_m3" name="가스(m³)" fill="#f59e0b" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
