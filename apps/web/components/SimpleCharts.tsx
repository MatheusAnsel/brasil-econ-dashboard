"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_TICK, ChartTooltip, formatNumber } from "./chart-kit";
import { TrendChart } from "./DualAxisChart";

export function RealRateChart({ data }: { data: { date: string; realRate: number }[] }) {
  return (
    <TrendChart
      data={data}
      series={[{ key: "realRate", label: "Juro real", color: "var(--series-3)" }]}
      unit="%"
      zeroLine
    />
  );
}

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: { correlation: number | null };
}

/** Barra com a ponta arredondada (4px) do lado do dado e a base reta, tanto para valores positivos quanto negativos. */
function RoundedBar({ x = 0, y = 0, width = 0, height = 0, fill, payload }: BarShapeProps) {
  const topo = Math.min(y, y + height);
  const altura = Math.abs(height);
  if (altura === 0 || width === 0) return <g />;
  const r = Math.min(4, altura / 2, width / 2);
  const positivo = (payload?.correlation ?? 0) >= 0;
  const d = positivo
    ? `M${x},${topo + altura} L${x},${topo + r} Q${x},${topo} ${x + r},${topo} L${x + width - r},${topo} Q${x + width},${topo} ${x + width},${topo + r} L${x + width},${topo + altura} Z`
    : `M${x},${topo} L${x + width},${topo} L${x + width},${topo + altura - r} Q${x + width},${topo + altura} ${x + width - r},${topo + altura} L${x + r},${topo + altura} Q${x},${topo + altura} ${x},${topo + altura - r} Z`;
  return <path d={d} fill={fill} />;
}

export function CorrelationChart({ data, height = 260 }: { data: { lag: number; correlation: number | null }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 12, right: 16, bottom: 22, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis
          dataKey="lag"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: "var(--grid)" }}
          label={{ value: "Defasagem (meses)", position: "bottom", offset: 2, fill: "var(--muted)", fontSize: 12 }}
        />
        <YAxis
          width={68}
          domain={[-1, 1]}
          ticks={[-1, -0.5, 0, 0.5, 1]}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => formatNumber(v, 1)}
        />
        <Tooltip
          cursor={{ fill: "var(--grid)", fillOpacity: 0.5 }}
          content={
            <ChartTooltip
              format={(v) => formatNumber(v, 2)}
              title={(l) => (Number(l) === 0 ? "Sem defasagem" : `Defasagem de ${l} meses`)}
            />
          }
        />
        <ReferenceLine y={0} stroke="var(--muted)" strokeOpacity={0.6} />
        <Bar
          dataKey="correlation"
          name="Correlação de Pearson"
          fill="var(--series-1)"
          barSize={24}
          shape={<RoundedBar />}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
