import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { etlRuns } from "@econ/db";
import { buildApp } from "./app";
import { createRedisCache, dataVersion, noopCache } from "./cache";
import { MemoryCache, mensais, resetDb, seedSeries, testDb } from "../../../test/helpers";

const { db, pool } = testDb();
afterAll(() => pool.end());
beforeEach(() => resetDb(db));

async function comCache(cache: MemoryCache) {
  return buildApp(db, { logger: false, cache });
}

const cabecalho = (res: { headers: Record<string, unknown> }) => res.headers["x-cache"];

describe("cache das rotas pesadas", () => {
  let app: FastifyInstance;
  let cache: MemoryCache;

  beforeEach(async () => {
    cache = new MemoryCache();
    app = await comCache(cache);
  });
  afterAll(async () => app?.close());

  it("a primeira chamada é MISS e a segunda é HIT, com o mesmo corpo", async () => {
    await seedSeries(db, "432", mensais("2024-01", [1, 2, 3, 4]));
    await seedSeries(db, "13522", mensais("2024-01", [2, 4, 6, 8]));

    const primeira = await app.inject({ method: "GET", url: "/analytics/correlation" });
    const segunda = await app.inject({ method: "GET", url: "/analytics/correlation" });

    expect(cabecalho(primeira)).toBe("MISS");
    expect(cabecalho(segunda)).toBe("HIT");
    expect(segunda.json()).toEqual(primeira.json());
  });

  it("serve do cache sem consultar as observações de novo", async () => {
    await seedSeries(db, "432", mensais("2024-01", [1, 2, 3, 4]));
    await seedSeries(db, "13522", mensais("2024-01", [2, 4, 6, 8]));
    await app.inject({ method: "GET", url: "/analytics/correlation" });

    // Mudar os dados direto no banco não afeta a resposta em cache: prova que ela veio do Redis, não do banco.
    await db.execute(`DELETE FROM observations` as never).catch(() => undefined);
    await resetDb(db);
    const res = await app.inject({ method: "GET", url: "/analytics/correlation" });

    expect(cabecalho(res)).toBe("HIT");
    expect(res.statusCode).toBe(200);
  });

  it("separa as chaves por parâmetros: lags diferentes não se misturam", async () => {
    await seedSeries(db, "432", mensais("2024-01", [1, 2, 3, 4, 5, 6]));
    await seedSeries(db, "13522", mensais("2024-01", [9, 9, 2, 4, 6, 8]));

    const l0 = await app.inject({ method: "GET", url: "/analytics/correlation?lag=0" });
    const l2 = await app.inject({ method: "GET", url: "/analytics/correlation?lag=2" });
    const l2de_novo = await app.inject({ method: "GET", url: "/analytics/correlation?lag=2" });

    expect(cabecalho(l0)).toBe("MISS");
    expect(cabecalho(l2)).toBe("MISS");
    expect(cabecalho(l2de_novo)).toBe("HIT");
    expect(l0.json().correlation).not.toBe(l2.json().correlation);
  });

  it("cacheia o juro real e as observações agregadas, mas não as sem agregação", async () => {
    const id = await seedSeries(db, "432", mensais("2024-01", [10, 11]));
    await seedSeries(db, "13522", mensais("2024-01", [4, 4]));

    const real1 = await app.inject({ method: "GET", url: "/analytics/real-rate" });
    const real2 = await app.inject({ method: "GET", url: "/analytics/real-rate" });
    const mes1 = await app.inject({ method: "GET", url: `/series/${id}/observations?agg=month` });
    const mes2 = await app.inject({ method: "GET", url: `/series/${id}/observations?agg=month` });
    const bruta = await app.inject({ method: "GET", url: `/series/${id}/observations` });

    expect([cabecalho(real1), cabecalho(real2)]).toEqual(["MISS", "HIT"]);
    expect([cabecalho(mes1), cabecalho(mes2)]).toEqual(["MISS", "HIT"]);
    expect(cabecalho(bruta)).toBeUndefined(); // consulta simples por índice: não passa pelo cache
  });

  it("não cacheia respostas sem dados (404): quando o ETL rodar, a resposta certa aparece", async () => {
    const vazia = await app.inject({ method: "GET", url: "/analytics/correlation" });
    expect(vazia.statusCode).toBe(404);
    expect(cache.store.size).toBe(0);

    await seedSeries(db, "432", mensais("2024-01", [1, 2, 3]));
    await seedSeries(db, "13522", mensais("2024-01", [1, 2, 3]));
    const depois = await app.inject({ method: "GET", url: "/analytics/correlation" });

    expect(depois.statusCode).toBe(200);
    expect(cabecalho(depois)).toBe("MISS");
  });

  it("não cacheia erros de validação", async () => {
    await app.inject({ method: "GET", url: "/analytics/correlation?lag=99" });
    expect(cache.sets).toBe(0);
  });

  it("um ETL concluído com sucesso invalida o cache sozinho (a versão dos dados entra na chave)", async () => {
    await seedSeries(db, "432", mensais("2024-01", [1, 2, 3, 4]));
    await seedSeries(db, "13522", mensais("2024-01", [2, 4, 6, 8]));

    const antes = await app.inject({ method: "GET", url: "/analytics/correlation" });
    const igual = await app.inject({ method: "GET", url: "/analytics/correlation" });
    await db.insert(etlRuns).values({ source: "bcb", status: "success", finishedAt: new Date() });
    const depois = await app.inject({ method: "GET", url: "/analytics/correlation" });

    expect([cabecalho(antes), cabecalho(igual), cabecalho(depois)]).toEqual(["MISS", "HIT", "MISS"]);
  });

  it("um ETL com erro não invalida o cache", async () => {
    await seedSeries(db, "432", mensais("2024-01", [1, 2, 3]));
    await seedSeries(db, "13522", mensais("2024-01", [1, 2, 3]));
    await app.inject({ method: "GET", url: "/analytics/correlation" });

    await db.insert(etlRuns).values({ source: "bcb", status: "error", finishedAt: new Date() });
    const res = await app.inject({ method: "GET", url: "/analytics/correlation" });

    expect(cabecalho(res)).toBe("HIT");
  });

  it("GET /ready informa que o cache está ativo", async () => {
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.json()).toEqual({ status: "ok", db: "up", cache: "up" });
  });
});

describe("sem cache configurado", () => {
  it("o cabeçalho x-cache indica BYPASS e a resposta continua correta", async () => {
    const app = await buildApp(db, { logger: false });
    await seedSeries(db, "432", mensais("2024-01", [1, 2, 3]));
    await seedSeries(db, "13522", mensais("2024-01", [3, 2, 1]));

    const res = await app.inject({ method: "GET", url: "/analytics/correlation" });

    expect(cabecalho(res)).toBe("BYPASS");
    expect(res.json().correlation).toBeCloseTo(-1, 10);
    await app.close();
  });
});

describe("noopCache", () => {
  it("não guarda nada e nunca falha", async () => {
    expect(noopCache.enabled).toBe(false);
    await noopCache.set("k", "v", 10);
    expect(await noopCache.get("k")).toBeNull();
    expect(await noopCache.ping()).toBe(false);
    await expect(noopCache.close()).resolves.toBeUndefined();
  });
});

describe("dataVersion", () => {
  it('é "0" enquanto nenhum ETL terminou com sucesso', async () => {
    expect(await dataVersion(db)).toBe("0");
  });

  it("muda quando um novo ETL termina com sucesso", async () => {
    await db.insert(etlRuns).values({ source: "bcb", status: "success", finishedAt: new Date("2024-01-01T00:00:00Z") });
    const v1 = await dataVersion(db);
    await db.insert(etlRuns).values({ source: "bcb", status: "success", finishedAt: new Date("2024-01-02T00:00:00Z") });
    const v2 = await dataVersion(db);
    expect(v1).not.toBe(v2);
    expect(Number(v2)).toBeGreaterThan(Number(v1));
  });
});

describe("resiliência: Redis fora do ar nunca derruba a API", () => {
  it("get devolve null, set não lança e ping devolve false", async () => {
    const quebrado = createRedisCache("redis://127.0.0.1:1"); // porta onde não há Redis
    expect(await quebrado.get("qualquer")).toBeNull();
    await expect(quebrado.set("k", "v", 10)).resolves.toBeUndefined();
    expect(await quebrado.ping()).toBe(false);
    await quebrado.close();
  });

  it("as rotas respondem normalmente (MISS) e /ready mostra o cache como down", async () => {
    const quebrado = createRedisCache("redis://127.0.0.1:1");
    const app = await buildApp(db, { logger: false, cache: quebrado });
    await seedSeries(db, "432", mensais("2024-01", [1, 2, 3]));
    await seedSeries(db, "13522", mensais("2024-01", [1, 2, 3]));

    const res = await app.inject({ method: "GET", url: "/analytics/correlation" });
    const ready = await app.inject({ method: "GET", url: "/ready" });

    expect(res.statusCode).toBe(200);
    expect(cabecalho(res)).toBe("MISS");
    expect(ready.statusCode).toBe(200);
    expect(ready.json().cache).toBe("down");
    await app.close();
  });
});

// Roda só quando há um Redis de verdade (no CI, o serviço redis; localmente, TEST_REDIS_URL).
describe.skipIf(!process.env.TEST_REDIS_URL)("Redis real", () => {
  let app: FastifyInstance;
  let redis: ReturnType<typeof createRedisCache>;

  beforeAll(async () => {
    redis = createRedisCache(process.env.TEST_REDIS_URL as string);
    await redis.ready();
    app = await buildApp(db, { logger: false, cache: redis });
  });
  afterAll(async () => app.close());

  it("guarda no Redis e serve da segunda vez; expira com TTL", async () => {
    await seedSeries(db, "432", mensais("2024-01", [1, 2, 3, 4]));
    await seedSeries(db, "13522", mensais("2024-01", [2, 4, 6, 9]));
    await db.insert(etlRuns).values({ source: "bcb", status: "success", finishedAt: new Date(Date.now() + Math.random() * 1000) });

    const a = await app.inject({ method: "GET", url: "/analytics/correlation" });
    const b = await app.inject({ method: "GET", url: "/analytics/correlation" });

    expect([cabecalho(a), cabecalho(b)]).toEqual(["MISS", "HIT"]);
    expect(b.json()).toEqual(a.json());
    expect((await app.inject({ method: "GET", url: "/ready" })).json().cache).toBe("up");
  });
});
