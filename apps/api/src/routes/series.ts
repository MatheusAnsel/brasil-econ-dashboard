import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { observations, series, type Db } from "@econ/db";
import { cached, noopCache, type Cache } from "../cache";
import { pontoItem, responses, serieItem, toSchema } from "../docs";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato yyyy-mm-dd");

const paramsSchema = z.object({ id: z.coerce.number().int().positive() });

const querySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  agg: z.enum(["none", "month", "year"]).default("none"),
});

export const seriesRoutes =
  (db: Db, cache: Cache = noopCache): FastifyPluginAsync =>
  async (app) => {
    // GET /series
    app.get(
      "/",
      {
        schema: {
          tags: ["Séries"],
          summary: "Lista as séries disponíveis",
          response: { 200: { type: "array", items: serieItem } },
        },
      },
      async () => db.select().from(series).orderBy(asc(series.id)),
    );

    // GET /series/:id/observations?from=&to=&agg=month
    app.get(
      "/:id/observations",
      {
        schema: {
          tags: ["Séries"],
          summary: "Observações de uma série",
          description:
            "Com `agg=month` ou `agg=year` devolve a média do período. Séries agregadas ficam em cache (Redis) até o próximo ETL.",
          params: toSchema(paramsSchema),
          querystring: toSchema(querySchema),
          response: {
            200: {
              type: "object",
              properties: {
                series: serieItem,
                agg: { type: "string", enum: ["none", "month", "year"] },
                data: { type: "array", items: pontoItem },
              },
            },
            400: responses.invalido,
            404: responses.naoEncontrado,
          },
        },
      },
      async (req, reply) => {
      const params = paramsSchema.safeParse(req.params);
      const query = querySchema.safeParse(req.query);
      if (!params.success || !query.success) {
        return reply.status(400).send({
          error: "Parâmetros inválidos",
          details: [...(params.error?.issues ?? []), ...(query.error?.issues ?? [])],
        });
      }
      const { id } = params.data;
      const { from, to, agg } = query.data;

      const [found] = await db.select().from(series).where(eq(series.id, id));
      if (!found) return reply.status(404).send({ error: "Série não encontrada" });

      const filters = [
        eq(observations.seriesId, id),
        from ? gte(observations.date, from) : undefined,
        to ? lte(observations.date, to) : undefined,
      ].filter((f) => f !== undefined);

      if (agg === "none") {
        const rows = await db
          .select({ date: observations.date, value: observations.value })
          .from(observations)
          .where(and(...filters))
          .orderBy(asc(observations.date));
        return { series: found, agg, data: rows.map((r) => ({ date: r.date, value: Number(r.value) })) };
      }

      // Agregação por média no período (mês ou ano). É a consulta pesada, então passa pelo cache.
      return cached(cache, db, reply, `obs:${id}:${agg}:${from ?? ""}:${to ?? ""}`, async () => {
        // A unidade vai como literal, não como parâmetro: com parâmetro o PostgreSQL não reconhece
        // a expressão do SELECT como igual à do GROUP BY e rejeita a consulta. É seguro porque `agg`
        // já foi validado pelo Zod como "month" ou "year" ("none" retorna antes).
        const unit = sql.raw(`'${agg}'`);
        const bucket = sql<string>`to_char(date_trunc(${unit}, ${observations.date}), 'YYYY-MM-DD')`;
        const rows = await db
          .select({ date: bucket, value: sql<string>`avg(${observations.value})` })
          .from(observations)
          .where(and(...filters))
          .groupBy(bucket)
          .orderBy(bucket);
        return { series: found, agg, data: rows.map((r) => ({ date: r.date, value: Number(r.value) })) };
      });
    },
    );
  };
