import { and, eq, max, sql } from "drizzle-orm";
import { etlRuns, observations, series, type Db } from "@econ/db";
import { collectBcbSeries, type RawObservation } from "./collectors/bcb";
import { BCB_SERIES } from "./series";

const BATCH_SIZE = 1000;
// Margem de reprocessamento: algumas séries (ex.: IPCA) podem ser revisadas.
export const REPROCESS_DAYS = 60;

/** Função que busca as observações de uma série a partir de uma data. Injetável para testar sem rede. */
export type Collector = (code: string, start: Date) => Promise<RawObservation[]>;

export interface RunOptions {
  collect?: Collector;
  /** Data inicial da carga histórica (yyyy-mm-dd), usada quando a série ainda não tem dados. */
  defaultStart?: string;
  log?: Pick<Console, "log" | "error">;
}

export interface RunResult {
  ok: boolean;
  total: number;
  errors: string[];
}

export async function ensureSeries(db: Db) {
  for (const s of BCB_SERIES) {
    await db
      .insert(series)
      .values(s)
      .onConflictDoUpdate({
        target: [series.source, series.code],
        set: { name: s.name, unit: s.unit, periodicity: s.periodicity },
      });
  }
}

export async function startDateFor(db: Db, seriesId: number, defaultStart = "2000-01-01"): Promise<Date> {
  const [row] = await db
    .select({ last: max(observations.date) })
    .from(observations)
    .where(eq(observations.seriesId, seriesId));
  if (row?.last) {
    const d = new Date(`${row.last}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - REPROCESS_DAYS);
    return d;
  }
  return new Date(`${defaultStart}T00:00:00Z`);
}

export async function upsertObservations(db: Db, seriesId: number, rows: RawObservation[]) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({ seriesId, ...r }));
    await db
      .insert(observations)
      .values(batch)
      .onConflictDoUpdate({
        target: [observations.seriesId, observations.date],
        set: { value: sql`excluded.value` },
      });
  }
}

/**
 * Executa o ETL do BCB. Uma série que falha não impede as demais: o erro é registrado
 * em etl_runs e o resultado final fica com status "error".
 */
export async function runBcb(db: Db, options: RunOptions = {}): Promise<RunResult> {
  const { collect = collectBcbSeries, defaultStart, log = console } = options;
  const [run] = await db.insert(etlRuns).values({ source: "bcb" }).returning();
  let total = 0;
  const errors: string[] = [];

  await ensureSeries(db);

  for (const def of BCB_SERIES) {
    try {
      const [s] = await db
        .select()
        .from(series)
        .where(and(eq(series.source, def.source), eq(series.code, def.code)));
      const start = await startDateFor(db, s.id, defaultStart);
      const rows = await collect(def.code, start);
      await upsertObservations(db, s.id, rows);
      total += rows.length;
      log.log(`[bcb] ${def.name} (${def.code}): ${rows.length} observações`);
    } catch (err) {
      const msg = `${def.name} (${def.code}): ${(err as Error).message}`;
      log.error(`[bcb] erro em ${msg}`);
      errors.push(msg);
    }
  }

  await db
    .update(etlRuns)
    .set({
      finishedAt: new Date(),
      status: errors.length ? "error" : "success",
      rowsUpserted: total,
      error: errors.length ? errors.join("\n") : null,
    })
    .where(eq(etlRuns.id, run.id));

  return { ok: errors.length === 0, total, errors };
}
