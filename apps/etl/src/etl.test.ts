import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { etlRuns, observations, series } from "@econ/db";
import { REPROCESS_DAYS, runBcb, startDateFor, type Collector } from "./etl";
import { BCB_SERIES } from "./series";
import { resetDb, seedSeries, testDb } from "../../../test/helpers";

const { db, pool } = testDb();
const silencioso = { log: () => {}, error: () => {} };

beforeEach(() => resetDb(db));
afterAll(() => pool.end());

const contagem = async () => (await db.select().from(observations)).length;

describe("runBcb (ETL contra PostgreSQL real)", () => {
  it("cria as séries, grava as observações e registra a execução como sucesso", async () => {
    const collect: Collector = async (code) => [
      { date: "2024-01-01", value: "10.5" },
      { date: "2024-02-01", value: "11.0" },
    ];

    const result = await runBcb(db, { collect, log: silencioso });

    expect(result).toEqual({ ok: true, total: BCB_SERIES.length * 2, errors: [] });
    expect((await db.select().from(series)).map((s) => s.code).sort()).toEqual(
      BCB_SERIES.map((s) => s.code).sort(),
    );
    expect(await contagem()).toBe(BCB_SERIES.length * 2);

    const [run] = await db.select().from(etlRuns);
    expect(run.status).toBe("success");
    expect(run.rowsUpserted).toBe(BCB_SERIES.length * 2);
    expect(run.finishedAt).not.toBeNull();
    expect(run.error).toBeNull();
  });

  it("é idempotente: rodar duas vezes com os mesmos dados não duplica nada", async () => {
    const collect: Collector = async () => [
      { date: "2024-01-01", value: "10.5" },
      { date: "2024-02-01", value: "11.0" },
    ];

    await runBcb(db, { collect, log: silencioso });
    const depoisDaPrimeira = await contagem();
    await runBcb(db, { collect, log: silencioso });

    expect(await contagem()).toBe(depoisDaPrimeira);
    expect(await db.select().from(etlRuns)).toHaveLength(2);
  });

  it("atualiza valores revisados pela fonte (ex.: IPCA) sem criar linhas novas", async () => {
    let valor = "4.50";
    const collect: Collector = async () => [{ date: "2024-03-01", value: valor }];

    await runBcb(db, { collect, log: silencioso });
    valor = "4.62"; // o BCB revisou o número
    await runBcb(db, { collect, log: silencioso });

    const linhas = await db.select().from(observations).where(eq(observations.date, "2024-03-01"));
    expect(linhas).toHaveLength(BCB_SERIES.length);
    expect(linhas.every((l) => Number(l.value) === 4.62)).toBe(true);
  });

  it("uma série que falha não impede as outras e a execução fica com status error", async () => {
    const collect: Collector = async (code) => {
      if (code === "433") throw new Error("HTTP 503 do SGS");
      return [{ date: "2024-01-01", value: "1" }];
    };

    const result = await runBcb(db, { collect, log: silencioso });

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("IPCA mensal (433)");
    expect(result.errors[0]).toContain("HTTP 503 do SGS");
    expect(result.total).toBe(BCB_SERIES.length - 1);

    const [run] = await db.select().from(etlRuns);
    expect(run.status).toBe("error");
    expect(run.error).toContain("433");
    // as séries saudáveis foram gravadas
    expect(await contagem()).toBe(BCB_SERIES.length - 1);
  });

  it("na segunda execução pede dados só a partir da última observação menos a margem de reprocessamento", async () => {
    const pedidos: Array<{ code: string; start: string }> = [];
    const collect: Collector = async (code, start) => {
      pedidos.push({ code, start: start.toISOString().slice(0, 10) });
      return [{ date: "2024-06-15", value: "1" }];
    };

    await runBcb(db, { collect, defaultStart: "2010-01-01", log: silencioso });
    pedidos.length = 0;
    await runBcb(db, { collect, defaultStart: "2010-01-01", log: silencioso });

    const esperado = new Date("2024-06-15T00:00:00Z");
    esperado.setUTCDate(esperado.getUTCDate() - REPROCESS_DAYS);
    expect(pedidos).toHaveLength(BCB_SERIES.length);
    expect(pedidos.every((p) => p.start === esperado.toISOString().slice(0, 10))).toBe(true);
  });

  it("na primeira execução usa a data inicial configurada", async () => {
    const pedidos: string[] = [];
    const collect: Collector = async (_code, start) => {
      pedidos.push(start.toISOString().slice(0, 10));
      return [];
    };

    await runBcb(db, { collect, defaultStart: "2015-05-01", log: silencioso });

    expect(new Set(pedidos)).toEqual(new Set(["2015-05-01"]));
  });

  it("grava cargas grandes em lotes sem perder linhas", async () => {
    const collect: Collector = async (code) =>
      code === "1"
        ? Array.from({ length: 2500 }, (_, i) => ({
            date: new Date(Date.UTC(2015, 0, 1 + i)).toISOString().slice(0, 10),
            value: String(i),
          }))
        : [];

    const result = await runBcb(db, { collect, log: silencioso });

    expect(result.total).toBe(2500);
    expect(await contagem()).toBe(2500);
  });
});

describe("startDateFor", () => {
  it("sem dados, devolve a data inicial padrão", async () => {
    const id = await seedSeries(db, "999", []);
    expect((await startDateFor(db, id)).toISOString().slice(0, 10)).toBe("2000-01-01");
  });

  it("com dados, devolve a última data menos a margem", async () => {
    const id = await seedSeries(db, "998", [
      ["2024-01-01", 1],
      ["2024-05-01", 2],
    ]);
    const d = await startDateFor(db, id);
    const esperado = new Date("2024-05-01T00:00:00Z");
    esperado.setUTCDate(esperado.getUTCDate() - REPROCESS_DAYS);
    expect(d.toISOString()).toBe(esperado.toISOString());
  });
});

describe("ordem das observações gravadas", () => {
  it("mantém as datas recuperáveis em ordem cronológica", async () => {
    const collect: Collector = async (code) =>
      code === "432"
        ? [
            { date: "2024-03-01", value: "3" },
            { date: "2024-01-01", value: "1" },
            { date: "2024-02-01", value: "2" },
          ]
        : [];
    await runBcb(db, { collect, log: silencioso });
    const [s] = await db.select().from(series).where(eq(series.code, "432"));
    const linhas = await db
      .select()
      .from(observations)
      .where(eq(observations.seriesId, s.id))
      .orderBy(asc(observations.date));
    expect(linhas.map((l) => l.date)).toEqual(["2024-01-01", "2024-02-01", "2024-03-01"]);
  });
});
