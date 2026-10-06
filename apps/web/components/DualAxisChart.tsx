"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Props {
  data: Record<string, string | number>[];
  left: { key: string; label: string; color: string };
  right: { key: string; label: string; color: string };
  unitLeft: string;
  unitRight: string;
}

export function DualAxisChart({ data, left, right, unitLeft, unitRight }: Props) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#d9dde3" />
        <XAxis dataKey="date" minTickGap={48} tick={{ fontSize: 12 }} />
        <YAxis yAxisId="l" tick={{ fontSize: 12 }} unit={unitLeft} />
        <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 12 }} unit={unitRight} />
        <Tooltip />
        <Legend />
        <Line yAxisId="l" type="monotone" dataKey={left.key} name={left.label} stroke={left.color} dot={false} strokeWidth={2} />
        <Line yAxisId="r" type="monotone" dataKey={right.key} name={right.label} stroke={right.color} dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
