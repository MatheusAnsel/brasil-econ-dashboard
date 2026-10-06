"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function RealRateChart({ data }: { data: { date: string; realRate: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#d9dde3" />
        <XAxis dataKey="date" minTickGap={48} tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} unit="%" />
        <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} />
        <ReferenceLine y={0} stroke="#6b7280" />
        <Line type="monotone" dataKey="realRate" name="Juro real" stroke="#0f766e" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CorrelationChart({ data }: { data: { lag: number; correlation: number | null }[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#d9dde3" />
        <XAxis dataKey="lag" tick={{ fontSize: 12 }} label={{ value: "Defasagem (meses)", position: "insideBottom", offset: -2, fontSize: 12 }} />
        <YAxis domain={[-1, 1]} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(v) => Number(v).toFixed(3)} />
        <ReferenceLine y={0} stroke="#6b7280" />
        <Bar dataKey="correlation" name="Correlação de Pearson" fill="#1d4ed8" />
      </BarChart>
    </ResponsiveContainer>
  );
}
