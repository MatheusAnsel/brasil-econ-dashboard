import {
  date,
  integer,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const series = pgTable(
  "series",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(), // 'bcb' | 'ibge' | 'brasilapi'
    code: text("code").notNull(), // código na fonte (ex.: 432 no SGS)
    name: text("name").notNull(),
    unit: text("unit").notNull(), // '% a.a.', '% a.m.', 'R$'
    periodicity: text("periodicity").notNull(), // 'daily' | 'monthly' | 'quarterly'
  },
  (t) => [unique("series_source_code_uq").on(t.source, t.code)],
);

export const observations = pgTable(
  "observations",
  {
    seriesId: integer("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    value: numeric("value", { precision: 20, scale: 8 }).notNull(),
  },
  // A chave única torna o ETL idempotente: sempre upsert, nunca duplica.
  (t) => [primaryKey({ columns: [t.seriesId, t.date] })],
);

export const etlRuns = pgTable("etl_runs", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull().default("running"), // 'running' | 'success' | 'error'
  rowsUpserted: integer("rows_upserted").notNull().default(0),
  error: text("error"),
});

export type Series = typeof series.$inferSelect;
export type NewSeries = typeof series.$inferInsert;
export type Observation = typeof observations.$inferSelect;
export type EtlRun = typeof etlRuns.$inferSelect;
