import "@econ/db/src/env";
import { createDb } from "@econ/db";
import { buildApp } from "./app";
import { createRedisCache, noopCache } from "./cache";

const { db, pool } = createDb();
const cache = process.env.REDIS_URL ? createRedisCache(process.env.REDIS_URL) : noopCache;
const app = await buildApp(db, { cache });

const port = Number(process.env.PORT ?? 3333);
try {
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(cache.enabled ? "Cache Redis ativo" : "Cache desligado (REDIS_URL não definido)");
} catch (err) {
  app.log.error(err);
  await pool.end();
  process.exit(1);
}
