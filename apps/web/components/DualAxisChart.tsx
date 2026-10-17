"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_TICK, ChartTooltip, Legend, formatMonth, formatNumber, yearTicks } from "./chart-kit";

export interface SeriesDef {
  key: string;
  label: string;
  /** Cor da série, normalmente uma variável CSS do tema (`var(--series-1)`). */
  color: string;
}

interface Props {
  data: Record<string, string | number>[];
  series: SeriesDef[];
  /** Sufixo do valor: "%" ou "" (o prefixo vai em `prefix`). */
  unit?: string;
  prefix?: string;
  decimals?: number;
  height?: number;
  /** Esconde o eixo do tempo (usado quando outro gráfico logo abaixo compartilha o mesmo eixo). */
  hideXAxis?: boolean;
  syncId?: string;
  zeroLine?: boolean;
  /** Começa o eixo vertical no zero. */
  fromZero?: boolean;
  /** Largura reservada para os números do eixo vertical (use o mesmo valor em gráficos empilhados). */
  yWidth?: number;
  /** Texto curto acima do gráfico, para séries únicas (que não têm legenda). */
  caption?: string;
}

/** Linhas de uma ou mais séries na MESMA escala (nunca dois eixos verticais). */
export function TrendChart({
  data,
  series,
  unit = "",
  prefix = "",
  decimals = 1,
  height = 260,
  hideXAxis = false,
  syncId,
  zeroLine = false,
  fromZero = false,
  yWidth = 52,
  caption,
}: Props) {
  const dates = data.map((d) => String(d.date));
  const fmt = (v: number) => `${prefix}${formatNumber(v, decimals)}${unit}`;
  const last = data.length - 1;
  return (
    <div>
      {caption && <div className="caption">{caption}</div>}
      {series.length > 1 && <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} syncId={syncId} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="date"
            ticks={yearTicks(dates, 4)}
            tickFormatter={(d: string) => d.slice(0, 4)}
            tick={AXIS_TICK}
            axisLine={{ stroke: "var(--grid)" }}
            tickLine={false}
            height={hideXAxis ? 4 : 28}
            hide={hideXAxis}
          />
          <YAxis
            width={yWidth}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            tickCount={5}
            domain={fromZero ? [0, "auto"] : ["auto", "auto"]}
            tickFormatter={(v: number) => fmt(v)}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
            content={<ChartTooltip format={(v) => fmt(v)} title={(l) => formatMonth(String(l))} />}
          />
          {zeroLine && <ReferenceLine y={0} stroke="var(--muted)" strokeOpacity={0.6} />}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={(p: { cx?: number; cy?: number; index?: number }) =>
                p.index === last && p.cx !== undefined ? (
                  <circle key={`fim-${s.key}`} cx={p.cx} cy={p.cy} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
                ) : (
                  <g key={`vazio-${s.key}-${p.index}`} />
                )
              }
              activeDot={{ r: 4, fill: s.color, stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
