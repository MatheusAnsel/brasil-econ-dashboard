import { and, eq, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { observations, series, type Db } from "@econ/db";
import { correlationWithLag, realRateSeries, type MonthMap } from "../analytics";

const SELIC_META = "432";
const IPCA_12M = "13522";

/** Média mensal de uma série do BCB, indexada por 'YYYY-MM-01'. */
async function monthly(db: Db, code: string): Promise<MonthMap> {
  const [s] = await db
    .select({ id: series.id })
    .from(series)
    .where(and(eq(series.source, "bcb"), eq(series.code, code)));
  const map: MonthMap = new Map();
  if (!s) return map;

  const bucket = sql<string>`to_char(date_trunc('month', ${observations.date}), 'YYYY-MM-DD')`;
  const rows = await db
    .select({ month: bucket, value: sql<string>`avg(${observations.value})` })
    .from(observations)
    .where(eq(observations.seriesId, s.id))
    .groupBy(bucket);
  for (const r of rows) map.set(r.month, Number(r.value));
  return map;
}

const correlationQuery = z.object({
  a: z.string().min(1).default(SELIC_META),
  b: z.string().min(1).default(IPCA_12M),
  lag: z.coerce.number().int().min(-36).max(36).default(0),
});

const rangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const analyticsRoutes =
  (db: Db): FastifyPluginAsync =>
  async (app) => {
    // GET /analytics/correlation?a=432&b=13522&lag=6
    app.get("/correlation", async (req, reply) => {
      const q = correlationQuery.safeParse(req.query);
      if (!q.success) return reply.status(400).send({ error: "Parâmetros inválidos", details: q.error.issues });
      const { a, b, lag } = q.data;
      const [ma, mb] = await Promise.all([monthly(db, a), monthly(db, b)]);
      if (ma.size === 0 || mb.size === 0) {
        return reply.status(404).send({ error: "Série sem dados. Rode o ETL antes." });
      }
      return { a, b, lag, ...correlationWithLag(ma, mb, lag) };
    });

    // GET /analytics/real-rate
    app.get("/real-rate", async (req, reply) => {
      const q = rangeQuery.safeParse(req.query);
      if (!q.success) return reply.status(400).send({ error: "Parâmetros inválidos", details: q.error.issues });
      const { from, to } = q.data;
      const [selic, ipca] = await Promise.all([monthly(db, SELIC_META), monthly(db, IPCA_12M)]);
      const data = realRateSeries(selic, ipca).filter(
        (p) => (!from || p.date >= from) && (!to || p.date <= to),
      );
      return { method: "fisher", data };
    });
  };
