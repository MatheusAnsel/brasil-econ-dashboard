"use client";

import type { ReactNode } from "react";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2021-03" ou "2021-03-01" -> "mar/2021". */
export function formatMonth(date: string): string {
  const [ano, mes] = date.split("-");
  return `${MESES[Number(mes) - 1] ?? mes}/${ano}`;
}

/** Datas "AAAA-MM" que caem em janeiro a cada `step` anos, a partir do primeiro ano da série. */
export function yearTicks(dates: string[], step: number): string[] {
  const primeiroAno = Number((dates[0] ?? "0").slice(0, 4));
  return dates.filter((d) => d.slice(5, 7) === "01" && (Number(d.slice(0, 4)) - primeiroAno) % step === 0);
}

export function formatNumber(value: number, decimals = 1): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export interface LegendItem {
  label: string;
  color: string;
}

/** Legenda em HTML: a cor vem da marca ao lado, o texto usa a cor de texto do tema. */
export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="legend">
      {items.map((i) => (
        <li key={i.label}>
          <span className="swatch" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string | number }[];
  format: (value: number, key: string) => string;
  title?: (label: string | number) => ReactNode;
}

/** Caixa de detalhe ao passar o mouse: um ponto de cor e o valor por série. */
export function ChartTooltip({ active, label, payload, format, title }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip">
      <div className="tooltip-title">{title ? title(label ?? "") : String(label)}</div>
      {payload.map((p) => (
        <div className="tooltip-row" key={String(p.dataKey)}>
          <span className="swatch" style={{ background: p.color }} />
          <span className="tooltip-name">{p.name}</span>
          <span className="tooltip-value">{format(Number(p.value), String(p.dataKey))}</span>
        </div>
      ))}
    </div>
  );
}

export const AXIS_TICK = { fill: "var(--muted)", fontSize: 12 } as const;
