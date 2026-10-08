import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import { sql } from "drizzle-orm";
import type { Db } from "@econ/db";
import { noopCache, type Cache } from "./cache";
import { responses } from "./docs";
import { analyticsRoutes } from "./routes/analytics";
import { etlRoutes } from "./routes/etl";
import { seriesRoutes } from "./routes/series";

export interface AppOptions {
  cache?: Cache;
  logger?: boolean;
  /** Limite de requisições por IP em uma janela. Padrão: 120 por minuto. */
  rateLimit?: { max: number; timeWindow: string };
}

export async function buildApp(db: Db, options: AppOptions = {}) {
  const { cache = noopCache, logger = true, rateLimit: limit = { max: 120, timeWindow: "1 minute" } } = options;

  // Atrás de proxy (Render, nginx) o IP real do cliente vem em X-Forwarded-For.
  const app = Fastify({ logger, trustProxy: process.env.TRUST_PROXY === "true" });

  // Os schemas das rotas servem só para gerar a documentação. A validação real é feita
  // com Zod dentro de cada handler, então desligamos o validador e o serializador do Fastify.
  app.setValidatorCompiler(() => (data) => ({ value: data }));
  app.setSerializerCompiler(() => (data) => JSON.stringify(data));

  await app.register(helmet);
  await app.register(rateLimit, {
    max: limit.max,
    timeWindow: limit.timeWindow,
    allowList: (req) => req.url === "/health",
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      error: `Muitas requisições. Tente novamente em ${ctx.after}.`,
    }),
  });

  // Em produção, sem CORS_ORIGIN, nenhuma origem externa é aceita. Em desenvolvimento, qualquer uma.
  const origins = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim());
  await app.register(cors, { origin: origins ?? process.env.NODE_ENV !== "production" });

  await app.register(swagger, {
    openapi: {
      // 3.1 porque os schemas do Zod usam JSON Schema moderno (tipos nulos, exclusiveMinimum numérico).
      openapi: "3.1.0",
      info: {
        title: "Brasil Econ API",
        version: "0.1.0",
        description:
          "API de séries econômicas do Brasil (Banco Central). Dados públicos, sem autenticação, com limite de requisições por IP.",
      },
      tags: [
        { name: "Sistema" },
        { name: "Séries" },
        { name: "Análises" },
        { name: "ETL" },
      ],
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.get(
    "/health",
    {
      schema: {
        tags: ["Sistema"],
        summary: "Liveness: o processo está no ar",
        response: { 200: { type: "object", properties: { status: { type: "string" } } } },
      },
    },
    async () => ({ status: "ok" }),
  );

  app.get(
    "/ready",
    {
      schema: {
        tags: ["Sistema"],
        summary: "Readiness: o banco responde (e o cache, quando configurado)",
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              db: { type: "string" },
              cache: { type: "string", enum: ["disabled", "up", "down"] },
            },
          },
          503: { description: "Banco indisponível", ...responses.erro },
        },
      },
    },
    async (_req, reply) => {
      try {
        await db.execute(sql`select 1`);
      } catch {
        return reply.status(503).send({ status: "unavailable", db: "down" });
      }
      const cacheState = !cache.enabled ? "disabled" : (await cache.ping()) ? "up" : "down";
      // O cache é opcional: Redis fora do ar degrada a performance, não a disponibilidade.
      return { status: "ok", db: "up", cache: cacheState };
    },
  );

  await app.register(seriesRoutes(db, cache), { prefix: "/series" });
  await app.register(etlRoutes(db), { prefix: "/etl" });
  await app.register(analyticsRoutes(db, cache), { prefix: "/analytics" });

  app.addHook("onClose", async () => {
    await cache.close();
  });

  return app;
}
