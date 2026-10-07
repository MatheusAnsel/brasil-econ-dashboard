import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { etlRuns } from "@econ/db";
import { buildApp } from "./app";
import { mensais, resetDb, seedSeries, testDb } from "../../../test/helpers";

const { db, pool } = testDb();
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(db, { logger: false });
});
beforeEach(() => resetDb(db));
afterAll(async () => {
  await app.close();
  await pool.end();
});

const get = (url: string) => app.inject({ method: "GET", url });

describe("sistema", () => {
  it("GET /health responde ok sem tocar no banco", async () => {
    const res = await get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("GET /ready confirma o banco e informa que o cache está desligado", async () => {
    const res = await get("/ready");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", db: "up", cache: "disabled" });
  });

  it("GET /ready responde 503 quando o banco está inacessível", async () => {
    const quebrado = { execute: async () => Promise.reject(new Error("db fora")) } as unknown as typeof db;
    const appQuebrado = await buildApp(quebrado, { logger: false });
    const res = await appQuebrado.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "unavailable", db: "down" });
    await appQuebrado.close();
  });
});

describe("GET /series", () => {
  it("lista as séries em ordem de id", async () => {
    await seedSeries(db, "432", [], { name: "Meta Selic", periodicity: "daily" });
    await seedSeries(db, "433", [], { name: "IPCA mensal", unit: "% a.m." });

    const res = await get("/series");

    expect(res.statusCode).toBe(200);
    expect(res.json().map((s: { code: string }) => s.code)).toEqual(["432", "433"]);
    expect(res.json()[0]).toMatchObject({ source: "bcb", name: "Meta Selic", periodicity: "daily" });
  });

  it("devolve lista vazia quando o ETL ainda não rodou", async () => {
    const res = await get("/series");
    expect(res.json()).toEqual([]);
  });
});

describe("GET /series/:id/observations", () => {
  it("devolve as observações em ordem cronológica, com valores numéricos", async () => {
    const id = await seedSeries(db, "432", [
      ["2024-03-01", 10.75],
      ["2024-01-01", 11.75],
      ["2024-02-01", 11.25],
    ]);

    const res = await get(`/series/${id}/observations`);

    expect(res.statusCode).toBe(200);
    expect(res.json().agg).toBe("none");
    expect(res.json().data).toEqual([
      { date: "2024-01-01", value: 11.75 },
      { date: "2024-02-01", value: 11.25 },
      { date: "2024-03-01", value: 10.75 },
    ]);
  });

  it("filtra por período, inclusive nas bordas", async () => {
    const id = await seedSeries(db, "432", mensais("2024-01", [1, 2, 3, 4, 5]));

    const res = await get(`/series/${id}/observations?from=2024-02-01&to=2024-04-01`);

    expect(res.json().data.map((p: { date: string }) => p.date)).toEqual([
      "2024-02-01",
      "2024-03-01",
      "2024-04-01",
    ]);
  });

  it("agrega por mês usando a média", async () => {
    const id = await seedSeries(db, "1", [
      ["2024-01-10", 4],
      ["2024-01-20", 6],
      ["2024-02-05", 10],
    ]);

    const res = await get(`/series/${id}/observations?agg=month`);

    expect(res.json().data).toEqual([
      { date: "2024-01-01", value: 5 },
      { date: "2024-02-01", value: 10 },
    ]);
  });

  it("agrega por ano usando a média", async () => {
    const id = await seedSeries(db, "1", [
      ["2023-06-01", 2],
      ["2023-12-01", 4],
      ["2024-01-01", 10],
    ]);

    const res = await get(`/series/${id}/observations?agg=year`);

    expect(res.json().data).toEqual([
      { date: "2023-01-01", value: 3 },
      { date: "2024-01-01", value: 10 },
    ]);
  });

  it("responde 404 para série inexistente", async () => {
    const res = await get("/series/9999/observations");
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Série não encontrada" });
  });

  it.each([
    ["id não numérico", "/series/abc/observations"],
    ["id negativo", "/series/-1/observations"],
    ["data em formato errado", "/series/1/observations?from=01-01-2024"],
    ["agregação desconhecida", "/series/1/observations?agg=semana"],
  ])("responde 400 com detalhes para %s", async (_nome, url) => {
    const res = await get(url);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Parâmetros inválidos");
    expect(res.json().details.length).toBeGreaterThan(0);
  });
});

describe("GET /analytics/correlation", () => {
  it("calcula a correlação de Pearson entre duas séries mensais", async () => {
    await seedSeries(db, "432", mensais("2024-01", [1, 2, 3, 4, 5, 6]));
    await seedSeries(db, "13522", mensais("2024-01", [2, 4, 6, 8, 10, 12]));

    const res = await get("/analytics/correlation");

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ a: "432", b: "13522", lag: 0, n: 6 });
    expect(res.json().correlation).toBeCloseTo(1, 10);
  });

  it("detecta correlação negativa perfeita", async () => {
    await seedSeries(db, "432", mensais("2024-01", [1, 2, 3, 4, 5]));
    await seedSeries(db, "13522", mensais("2024-01", [10, 8, 6, 4, 2]));

    const res = await get("/analytics/correlation");

    expect(res.json().correlation).toBeCloseTo(-1, 10);
  });

  it("aplica a defasagem em meses e reduz o número de pares", async () => {
    await seedSeries(db, "432", mensais("2024-01", [1, 2, 3, 4, 5, 6]));
    await seedSeries(db, "13522", mensais("2024-01", [9, 9, 2, 4, 6, 8]));

    const res = await get("/analytics/correlation?lag=2");

    expect(res.json().lag).toBe(2);
    expect(res.json().n).toBe(4);
    expect(res.json().correlation).toBeCloseTo(1, 10);
  });

  it("usa a média mensal quando a série é diária", async () => {
    await seedSeries(db, "432", [
      ["2024-01-05", 1],
      ["2024-01-25", 3], // média de janeiro = 2
      ["2024-02-10", 4],
      ["2024-03-10", 6],
    ]);
    await seedSeries(db, "13522", mensais("2024-01", [20, 40, 60]));

    const res = await get("/analytics/correlation");

    expect(res.json().n).toBe(3);
    expect(res.json().correlation).toBeCloseTo(1, 10);
  });

  it("aceita outros códigos de série pelos parâmetros a e b", async () => {
    await seedSeries(db, "433", mensais("2024-01", [1, 2, 3, 4]));
    await seedSeries(db, "1", mensais("2024-01", [4, 3, 2, 1]));

    const res = await get("/analytics/correlation?a=433&b=1");

    expect(res.json()).toMatchObject({ a: "433", b: "1", n: 4 });
    expect(res.json().correlation).toBeCloseTo(-1, 10);
  });

  it("responde 404 pedindo o ETL quando alguma série não tem dados", async () => {
    await seedSeries(db, "432", mensais("2024-01", [1, 2, 3]));

    const res = await get("/analytics/correlation");

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain("Rode o ETL");
  });

  it.each([
    ["lag acima do limite", "?lag=37"],
    ["lag abaixo do limite", "?lag=-37"],
    ["lag não inteiro", "?lag=1.5"],
    ["código vazio", "?a="],
  ])("responde 400 para %s", async (_nome, query) => {
    const res = await get(`/analytics/correlation${query}`);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Parâmetros inválidos");
  });
});

describe("GET /analytics/real-rate", () => {
  it("calcula o juro real pela equação de Fisher", async () => {
    await seedSeries(db, "432", mensais("2024-01", [10, 12]));
    await seedSeries(db, "13522", mensais("2024-01", [4, 5]));

    const res = await get("/analytics/real-rate");

    expect(res.statusCode).toBe(200);
    expect(res.json().method).toBe("fisher");
    const [jan, fev] = res.json().data;
    expect(jan).toMatchObject({ date: "2024-01-01", selic: 10, ipca12m: 4 });
    expect(jan.realRate).toBeCloseTo(((1 + 0.1) / (1 + 0.04) - 1) * 100, 6);
    expect(fev.realRate).toBeCloseTo(((1 + 0.12) / (1 + 0.05) - 1) * 100, 6);
  });

  it("filtra por período", async () => {
    await seedSeries(db, "432", mensais("2024-01", [10, 11, 12, 13]));
    await seedSeries(db, "13522", mensais("2024-01", [4, 4, 4, 4]));

    const res = await get("/analytics/real-rate?from=2024-02-01&to=2024-03-01");

    expect(res.json().data.map((p: { date: string }) => p.date)).toEqual(["2024-02-01", "2024-03-01"]);
  });

  it("devolve lista vazia quando não há dados", async () => {
    const res = await get("/analytics/real-rate");
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });

  it("responde 400 para data inválida", async () => {
    const res = await get("/analytics/real-rate?from=ontem");
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /etl/status", () => {
  it("devolve null antes da primeira execução", async () => {
    const res = await get("/etl/status");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
  });

  it("devolve a execução mais recente", async () => {
    await db.insert(etlRuns).values({
      source: "bcb",
      startedAt: new Date("2024-01-01T09:00:00Z"),
      finishedAt: new Date("2024-01-01T09:01:00Z"),
      status: "error",
      rowsUpserted: 3,
      error: "falha antiga",
    });
    await db.insert(etlRuns).values({
      source: "bcb",
      startedAt: new Date("2024-02-01T09:00:00Z"),
      finishedAt: new Date("2024-02-01T09:02:00Z"),
      status: "success",
      rowsUpserted: 120,
    });

    const res = await get("/etl/status");

    expect(res.json()).toMatchObject({ status: "success", rowsUpserted: 120, error: null });
  });
});

describe("proteções HTTP", () => {
  it("envia os cabeçalhos de segurança do helmet", async () => {
    const res = await get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("limita requisições por IP (429) mas não limita o /health", async () => {
    const limitado = await buildApp(db, { logger: false, rateLimit: { max: 3, timeWindow: "1 minute" } });

    const respostas = [];
    for (let i = 0; i < 5; i++) respostas.push((await limitado.inject({ method: "GET", url: "/series" })).statusCode);
    const saude = await limitado.inject({ method: "GET", url: "/health" });

    expect(respostas).toEqual([200, 200, 200, 429, 429]);
    expect(saude.statusCode).toBe(200);
    await limitado.close();
  });

  it("não libera CORS para origens não listadas em CORS_ORIGIN", async () => {
    process.env.CORS_ORIGIN = "https://meu-front.vercel.app";
    const restrito = await buildApp(db, { logger: false });
    delete process.env.CORS_ORIGIN;

    const permitida = await restrito.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://meu-front.vercel.app" },
    });
    const negada = await restrito.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://site-malicioso.com" },
    });

    expect(permitida.headers["access-control-allow-origin"]).toBe("https://meu-front.vercel.app");
    expect(negada.headers["access-control-allow-origin"]).toBeUndefined();
    await restrito.close();
  });
});
