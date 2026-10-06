import cors from "@fastify/cors";
import Fastify from "fastify";
import type { Db } from "@econ/db";
import { etlRoutes } from "./routes/etl";
import { seriesRoutes } from "./routes/series";

export async function buildApp(db: Db) {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(",") ?? true,
  });

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(seriesRoutes(db), { prefix: "/series" });
  await app.register(etlRoutes(db), { prefix: "/etl" });

  return app;
}
