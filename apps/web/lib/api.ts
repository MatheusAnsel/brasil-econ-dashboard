export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

export interface SeriesInfo {
  id: number;
  source: string;
  code: string;
  name: string;
  unit: string;
  periodicity: string;
}

export interface Point {
  date: string;
  value: number;
}

export interface RealRatePoint {
  date: string;
  selic: number;
  ipca12m: number;
  realRate: number;
}

export interface EtlRun {
  source: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  rowsUpserted: number;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`Falha em ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const listSeries = () => get<SeriesInfo[]>("/series");

export const monthlyObservations = (id: number, from = "2005-01-01") =>
  get<{ data: Point[] }>(`/series/${id}/observations?agg=month&from=${from}`).then((r) => r.data);

export const realRate = (from = "2005-01-01") =>
  get<{ data: RealRatePoint[] }>(`/analytics/real-rate?from=${from}`).then((r) => r.data);

export const correlation = (a: string, b: string, lag: number) =>
  get<{ lag: number; n: number; correlation: number | null }>(
    `/analytics/correlation?a=${a}&b=${b}&lag=${lag}`,
  );

export const etlStatus = () => get<EtlRun | null>("/etl/status");
