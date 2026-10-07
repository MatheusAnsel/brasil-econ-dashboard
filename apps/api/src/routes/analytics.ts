import { and, eq, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { observations, series, type Db } from "@econ/db";
import { correlationWithLag, realRateSeries, type MonthMap } from "../analytics";
import { cached, noopCache, type Cache } from "../cache";
import { responses, toSchema } from "../docs";

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
  (db: Db, cache: Cache = noopCache): FastifyPluginAsync =>
  async (app) => {
    // GET /analytics/correlation?a=432&b=13522&lag=6
    app.get(
      "/correlation",
      {
        schema: {
          tags: ["Análises"],
          summary: "Correlação de Pearson entre duas séries do BCB",
          description:
            "Usa as médias mensais das séries. `lag` desloca a série `b` em meses (positivo: `b` depois de `a`). Resultado em cache até o próximo ETL.",
          querystring: toSchema(correlationQuery),
          response: {
            200: {
              type: "object",
              properties: {
                a: { type: "string" },
                b: { type: "string" },
                lag: { type: "integer" },
                n: { type: "integer", description: "Pares de meses usados no cálculo" },
                correlation: { type: ["number", "null"] },
              },
            },
            400: responses.invalido,
            404: responses.naoEncontrado,
          },
        },
      },
      async (req, reply) => {
        const q = correlationQuery.safeParse(req.query);
        if (!q.success) return reply.status(400).send({ error: "Parâmetros inválidos", details: q.error.issues });
        const { a, b, lag } = q.data;
        const result = await cached(cache, db, reply, `corr:${a}:${b}:${lag}`, async () => {
          const [ma, mb] = await Promise.all([monthly(db, a), monthly(db, b)]);
          if (ma.size === 0 || mb.size === 0) return null;
          return { a, b, lag, ...correlationWithLag(ma, mb, lag) };
        });
        if (!result) return reply.status(404).send({ error: "Série sem dados. Rode o ETL antes." });
        return result;
      },
    );

    // GET /analytics/real-rate
    app.get(
      "/real-rate",
      {
        schema: {
          tags: ["Análises"],
          summary: "Juro real mensal (equação de Fisher)",
          description: "Selic meta e IPCA acumulado em 12 meses, em média mensal. Resultado em cache até o próximo ETL.",
          querystring: toSchema(rangeQuery),
          response: {
            200: {
              type: "object",
              properties: {
                method: { type: "string", examples: ["fisher"] },
                data: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      date: { type: "string", format: "date" },
                      selic: { type: "number" },
                      ipca12m: { type: "number" },
                      realRate: { type: "number" },
                    },
                  },
                },
              },
            },
            400: responses.invalido,
          },
        },
      },
      async (req, reply) => {
        const q = rangeQuery.safeParse(req.query);
        if (!q.success) return reply.status(400).send({ error: "Parâmetros inválidos", details: q.error.issues });
        const { from, to } = q.data;
        return cached(cache, db, reply, `real:${from ?? ""}:${to ?? ""}`, async () => {
          const [selic, ipca] = await Promise.all([monthly(db, SELIC_META), monthly(db, IPCA_12M)]);
          const data = realRateSeries(selic, ipca).filter(
            (p) => (!from || p.date >= from) && (!to || p.date <= to),
          );
          return { method: "fisher", data };
        });
      },
    );
  };
