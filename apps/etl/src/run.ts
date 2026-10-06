import "@econ/db/src/env";
import { and, eq, max, sql } from "drizzle-orm";
import { createDb, etlRuns, observations, series } from "@econ/db";
import { collectBcbSeries } from "./collectors/bcb";
import { BCB_SERIES } from "./series";

const BATCH_SIZE = 1000;
// Margem de reprocessamento: algumas séries (ex.: IPCA) podem ser revisadas.
const REPROCESS_DAYS = 60;

const { db, pool } = createDb();

async function ensureSeries() {
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

async function startDateFor(seriesId: number): Promise<Date> {
  const [row] = await db
    .select({ last: max(observations.date) })
    .from(observations)
    .where(eq(observations.seriesId, seriesId));
  if (row?.last) {
    const d = new Date(`${row.last}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - REPROCESS_DAYS);
    return d;
  }
  return new Date(`${process.env.ETL_START_DATE ?? "2000-01-01"}T00:00:00Z`);
}

async function upsertObservations(seriesId: number, rows: { date: string; value: string }[]) {
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

async function runBcb() {
  const [run] = await db.insert(etlRuns).values({ source: "bcb" }).returning();
  let total = 0;
  const errors: string[] = [];

  await ensureSeries();

  for (const def of BCB_SERIES) {
    try {
      const [s] = await db
        .select()
        .from(series)
        .where(and(eq(series.source, def.source), eq(series.code, def.code)));
      const start = await startDateFor(s.id);
      const rows = await collectBcbSeries(def.code, start);
      await upsertObservations(s.id, rows);
      total += rows.length;
      console.log(`[bcb] ${def.name} (${def.code}): ${rows.length} observações`);
    } catch (err) {
      const msg = `${def.name} (${def.code}): ${(err as Error).message}`;
      console.error(`[bcb] erro em ${msg}`);
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

  return errors.length === 0;
}

const ok = await runBcb();
await pool.end();
process.exit(ok ? 0 : 1);
