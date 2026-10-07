import { sql } from "drizzle-orm";
import type { FastifyReply } from "fastify";
import { Redis } from "ioredis";
import { etlRuns, type Db } from "@econ/db";

export interface Cache {
  readonly enabled: boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

/** Cache desligado: usado quando REDIS_URL não está definido. */
export const noopCache: Cache = {
  enabled: false,
  get: async () => null,
  set: async () => {},
  ping: async () => false,
  close: async () => {},
};

/**
 * Cache em Redis. Qualquer falha do Redis (queda, timeout, rede) é tratada como "miss":
 * o cache é uma otimização e nunca pode derrubar a API.
 */
export function createRedisCache(url: string): Cache & { ready(): Promise<void> } {
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false, // sem Redis, falha na hora em vez de enfileirar e atrasar a resposta
    connectTimeout: 2000,
    retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
  });
  redis.on("error", () => {}); // erros já viram "miss"; evita log repetido a cada tentativa de reconexão

  return {
    enabled: true,
    ready: () =>
      redis.status === "ready"
        ? Promise.resolve()
        : new Promise((resolve) => redis.once("ready", () => resolve())),
    async get(key) {
      try {
        return await redis.get(key);
      } catch {
        return null;
      }
    },
    async set(key, value, ttlSeconds) {
      try {
        await redis.set(key, value, "EX", ttlSeconds);
      } catch {
        /* ignora: o próximo pedido recalcula */
      }
    },
    async ping() {
      try {
        return (await redis.ping()) === "PONG";
      } catch {
        return false;
      }
    },
    async close() {
      try {
        await redis.quit();
      } catch {
        redis.disconnect();
      }
    },
  };
}

/**
 * Versão dos dados: muda quando um ETL termina com sucesso. Entra na chave do cache,
 * então uma carga nova invalida tudo sozinha, sem precisar apagar chaves.
 */
export async function dataVersion(db: Db): Promise<string> {
  const [row] = await db
    .select({ at: sql<string | null>`extract(epoch from max(${etlRuns.finishedAt}))` })
    .from(etlRuns)
    .where(sql`${etlRuns.status} = 'success'`);
  return row?.at ?? "0";
}

export const CACHE_TTL_SECONDS = 60 * 60;

/**
 * Devolve o valor em cache ou calcula e guarda. `compute` devolvendo null (ex.: série sem dados)
 * não é cacheado. O cabeçalho x-cache informa HIT, MISS ou BYPASS (cache desligado).
 */
export async function cached<T>(
  cache: Cache,
  db: Db,
  reply: FastifyReply,
  key: string,
  compute: () => Promise<T | null>,
): Promise<T | null> {
  if (!cache.enabled) {
    reply.header("x-cache", "BYPASS");
    return compute();
  }
  const fullKey = `econ:v1:${await dataVersion(db)}:${key}`;
  const hit = await cache.get(fullKey);
  if (hit !== null) {
    reply.header("x-cache", "HIT");
    return JSON.parse(hit) as T;
  }
  reply.header("x-cache", "MISS");
  const value = await compute();
  if (value !== null) await cache.set(fullKey, JSON.stringify(value), CACHE_TTL_SECONDS);
  return value;
}
