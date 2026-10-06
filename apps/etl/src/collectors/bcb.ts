const BASE_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";

// O SGS limita consultas de séries diárias a janelas de ~10 anos.
// Usamos 9 anos por requisição para ter margem.
const WINDOW_YEARS = 9;

export interface RawObservation {
  date: string; // yyyy-mm-dd
  value: string;
}

export interface SgsRow {
  data: string; // dd/MM/yyyy
  valor: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

function toBr(d: Date): string {
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export function brToIso(s: string): string {
  const [dd, mm, yyyy] = s.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

/** Divide [start, end] em janelas consecutivas de no máximo WINDOW_YEARS anos. */
export function buildWindows(start: Date, end: Date): Array<[Date, Date]> {
  const windows: Array<[Date, Date]> = [];
  let cursor = start;
  while (cursor <= end) {
    const next = new Date(cursor);
    next.setUTCFullYear(next.getUTCFullYear() + WINDOW_YEARS);
    const windowEnd = next < end ? new Date(next.getTime() - 86_400_000) : end;
    windows.push([cursor, windowEnd]);
    cursor = new Date(windowEnd.getTime() + 86_400_000);
  }
  return windows;
}

async function fetchWindow(code: string, start: Date, end: Date, attempt = 1): Promise<SgsRow[]> {
  const url = `${BASE_URL}.${code}/dados?formato=json&dataInicial=${toBr(start)}&dataFinal=${toBr(end)}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
    return (await res.json()) as SgsRow[];
  } catch (err) {
    if (attempt >= 4) throw err;
    const delay = 1000 * 2 ** attempt;
    console.warn(`[bcb] falha na série ${code} (tentativa ${attempt}), nova tentativa em ${delay}ms`);
    await new Promise((r) => setTimeout(r, delay));
    return fetchWindow(code, start, end, attempt + 1);
  }
}

/** Converte linhas cruas do SGS, descartando valores vazios ou não numéricos. */
export function parseSgsRows(rows: SgsRow[]): RawObservation[] {
  const out: RawObservation[] = [];
  for (const row of rows) {
    if (row.valor === "" || row.valor == null) continue;
    if (Number.isNaN(Number(row.valor))) continue;
    out.push({ date: brToIso(row.data), value: row.valor });
  }
  return out;
}

export async function collectBcbSeries(
  code: string,
  start: Date,
  end: Date = new Date(),
): Promise<RawObservation[]> {
  const out: RawObservation[] = [];
  for (const [ws, we] of buildWindows(start, end)) {
    out.push(...parseSgsRows(await fetchWindow(code, ws, we)));
  }
  return out;
}
