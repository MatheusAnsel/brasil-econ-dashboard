/** Mapa de mês ('YYYY-MM-01') para valor. */
export type MonthMap = Map<string, number>;

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3 || n !== ys.length) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * Pareia a[t] com b[t + lag] (em meses). Com lag positivo, mede como
 * `a` hoje se relaciona com `b` daqui a `lag` meses.
 */
export function alignWithLag(a: MonthMap, b: MonthMap, lag: number) {
  const x: number[] = [];
  const y: number[] = [];
  for (const [month, va] of a) {
    const vb = b.get(addMonths(month, lag));
    if (vb !== undefined) {
      x.push(va);
      y.push(vb);
    }
  }
  return { x, y };
}

export function correlationWithLag(a: MonthMap, b: MonthMap, lag: number) {
  const { x, y } = alignWithLag(a, b, lag);
  return { n: x.length, correlation: pearson(x, y) };
}

/** Juro real ex-post pela equação de Fisher: ((1 + nominal) / (1 + inflação) - 1) * 100. */
export function realRate(nominalPct: number, inflationPct: number): number {
  return ((1 + nominalPct / 100) / (1 + inflationPct / 100) - 1) * 100;
}

export function realRateSeries(selic: MonthMap, ipca12m: MonthMap) {
  const out: { date: string; selic: number; ipca12m: number; realRate: number }[] = [];
  for (const [month, s] of [...selic].sort(([a], [b]) => a.localeCompare(b))) {
    const i = ipca12m.get(month);
    if (i === undefined) continue;
    out.push({ date: month, selic: s, ipca12m: i, realRate: realRate(s, i) });
  }
  return out;
}
