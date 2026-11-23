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

// A API no plano gratuito leva perto de 1 minuto para acordar. Passado este limite, a requisição é
// cancelada e conta como falha (a página tenta de novo e, no fim, mostra o erro): ninguém fica preso.
export const REQUEST_TIMEOUT_MS = 70_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: "timeout" | "network" | "http",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function get<T>(path: string, fetchImpl: typeof fetch = fetch, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(`${API_URL}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new ApiError(`a API não respondeu em ${Math.round(timeoutMs / 1000)} s`, "timeout");
    }
    throw new ApiError("sem conexão com a API", "network");
  }
  if (!res.ok) throw new ApiError(`a API respondeu com erro (HTTP ${res.status}) em ${path}`, "http");
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
