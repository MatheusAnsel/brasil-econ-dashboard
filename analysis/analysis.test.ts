import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { etlRuns } from "@econ/db";
import { alignWithLag, pearson, realRate, type MonthMap } from "../apps/api/src/analytics";
import { mensais, resetDb, seedSeries, testDb } from "../test/helpers";

// Roda cada consulta da pasta analysis/ contra o PostgreSQL de testes, com dados conhecidos,
// e confere o resultado. Assim o SQL documentado no portfólio não fica desatualizado em relação ao esquema.

const { db, pool } = testDb();

type Row = Record<string, unknown>;

async function rodar(arquivo: string): Promise<Row[]> {
  const texto = readFileSync(new URL(`./${arquivo}`, import.meta.url), "utf8");
  const result = await pool.query(texto);
  return result.rows as Row[];
}

const num = (v: unknown) => (v === null ? null : Number(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

beforeEach(() => resetDb(db));

afterAll(async () => {
  await pool.end();
});

describe("01_cobertura_e_qualidade.sql", () => {
  it("conta observações, período e meses sem dado", async () => {
    // jan a abr de 2024, sem fevereiro
    await seedSeries(db, "433", [
      ["2024-01-01", 0.42],
      ["2024-03-01", 0.16],
      ["2024-04-01", 0.38],
    ]);
    await seedSeries(db, "1", []);

    const rows = await rodar("01_cobertura_e_qualidade.sql");
    const ipca = rows.find((r) => r.code === "433")!;
    expect(num(ipca.observacoes)).toBe(3);
    expect(iso(ipca.primeira_data)).toBe("2024-01-01");
    expect(iso(ipca.ultima_data)).toBe("2024-04-01");
    expect(num(ipca.meses_esperados)).toBe(4);
    expect(num(ipca.meses_sem_dado)).toBe(1);

    const vazia = rows.find((r) => r.code === "1")!;
    expect(num(vazia.observacoes)).toBe(0);
  });
});

describe("02_ipca_acumulado_por_ano.sql", () => {
  it("compõe a inflação do ano e ranqueia só anos fechados", async () => {
    const ano2022 = [0.54, 1.01, 1.62, 1.06, 0.47, 0.67, -0.68, -0.36, -0.29, 0.59, 0.41, 0.62];
    const ano2023 = [0.53, 0.84, 0.71, 0.61, 0.23, -0.08, 0.12, 0.23, 0.26, 0.24, 0.28, 0.56];
    await seedSeries(db, "433", [
      ...mensais("2022-01", ano2022),
      ...mensais("2023-01", ano2023),
      ...mensais("2024-01", [0.42, 0.83]),
    ]);

    const rows = await rodar("02_ipca_acumulado_por_ano.sql");
    const composto = (xs: number[]) => (xs.reduce((acc, x) => acc * (1 + x / 100), 1) - 1) * 100;

    const r2022 = rows.find((r) => r.ano === 2022)!;
    const r2023 = rows.find((r) => r.ano === 2023)!;
    const r2024 = rows.find((r) => r.ano === 2024)!;

    expect(num(r2022.ipca_acumulado_ano)).toBeCloseTo(composto(ano2022), 2);
    expect(num(r2023.ipca_acumulado_ano)).toBeCloseTo(composto(ano2023), 2);
    expect(r2022.mes_mais_alto).toBe("03");
    expect(num(r2022.meses_com_deflacao)).toBe(3);

    // 2022 teve inflação maior que 2023; 2024 está incompleto e não entra no ranking
    expect(num(r2022.ranking_ano_fechado)).toBe(1);
    expect(num(r2023.ranking_ano_fechado)).toBe(2);
    expect(num(r2024.meses)).toBe(2);
    expect(r2024.ranking_ano_fechado).toBeNull();
  });
});

describe("03_selic_decisoes_copom.sql", () => {
  it("lista só os dias em que a meta mudou, com a variação em pontos-base", async () => {
    await seedSeries(
      db,
      "432",
      [
        ["2023-07-31", 13.75],
        ["2023-08-01", 13.75],
        ["2023-08-03", 13.25],
        ["2023-08-04", 13.25],
        ["2023-09-21", 12.75],
        ["2024-06-20", 12.75],
        ["2024-09-19", 10.75],
      ],
      { periodicity: "daily" },
    );

    const rows = await rodar("03_selic_decisoes_copom.sql");
    expect(rows).toHaveLength(3);

    expect(iso(rows[0].vigente_desde)).toBe("2023-08-03");
    expect(num(rows[0].variacao_bps)).toBe(-50);
    expect(rows[0].decisao).toBe("corte");
    expect(rows[0].dias_no_patamar_anterior).toBeNull();

    expect(iso(rows[1].vigente_desde)).toBe("2023-09-21");
    expect(num(rows[1].dias_no_patamar_anterior)).toBe(49);

    expect(num(rows[2].variacao_bps)).toBe(-200);
  });

  it("marca alta quando a meta sobe", async () => {
    await seedSeries(db, "432", [
      ["2024-09-17", 10.5],
      ["2024-09-19", 10.75],
    ]);
    const [linha] = await rodar("03_selic_decisoes_copom.sql");
    expect(linha.decisao).toBe("alta");
    expect(num(linha.variacao_bps)).toBe(25);
  });
});

describe("04_juro_real_mensal.sql", () => {
  it("bate com o cálculo de Fisher usado pela API", async () => {
    const selic = [13.75, 13.75, 13.25, 12.75, 12.25];
    const ipca = [4.18, 4.61, 5.19, 4.82, 4.68];
    // a Selic tem um mês a mais (dez/2023) sem IPCA correspondente: esse mês fica de fora
    await seedSeries(db, "432", mensais("2023-07", [...selic, 11.75]));
    await seedSeries(db, "13522", mensais("2023-07", ipca));

    const rows = await rodar("04_juro_real_mensal.sql");
    expect(rows).toHaveLength(5);
    rows.forEach((r, i) => {
      expect(num(r.juro_real)).toBeCloseTo(realRate(selic[i], ipca[i]), 2);
      expect(num(r.diferenca_simples)).toBeCloseTo(selic[i] - ipca[i], 2);
    });
  });

  it("usa a média do mês quando a Selic é diária", async () => {
    await seedSeries(db, "432", [
      ["2024-01-02", 11.75],
      ["2024-01-31", 11.25],
    ]);
    await seedSeries(db, "13522", [["2024-01-01", 4.51]]);
    const [linha] = await rodar("04_juro_real_mensal.sql");
    expect(num(linha.selic)).toBe(11.5);
    expect(num(linha.juro_real)).toBeCloseTo(realRate(11.5, 4.51), 2);
  });
});

describe("05_defasagem_selic_ipca.sql", () => {
  it("dá a mesma correlação que a API para cada defasagem", async () => {
    const selic = [2, 2, 3.5, 5.25, 7.75, 9.25, 11.75, 13.25, 13.75, 13.75, 13.75, 13.75, 13.25, 12.25];
    const ipca = [8.35, 9.68, 10.25, 10.67, 10.74, 10.38, 11.3, 12.13, 11.73, 11.89, 10.07, 8.73, 7.17, 6.47];
    await seedSeries(db, "432", mensais("2021-06", selic));
    await seedSeries(db, "13522", mensais("2021-06", ipca));

    const rows = await rodar("05_defasagem_selic_ipca.sql");

    const mapa = (xs: number[]): MonthMap =>
      new Map(mensais("2021-06", xs).map(([d, v]) => [d, v] as [string, number]));
    for (const lag of [0, 3, 6]) {
      const { x, y } = alignWithLag(mapa(selic), mapa(ipca), lag);
      const linha = rows.find((r) => r.defasagem_meses === lag)!;
      expect(num(linha.pares)).toBe(x.length);
      expect(num(linha.correlacao)).toBeCloseTo(pearson(x, y)!, 3);
    }

    // com 14 meses de dados não há pares a partir de 14 meses de defasagem
    expect(rows.find((r) => r.defasagem_meses === 14)).toBeUndefined();
  });
});

describe("06_dolar_variacao_volatilidade.sql", () => {
  it("usa o último dia do mês como fechamento e só mostra volatilidade com 12 variações", async () => {
    const fechamentos = [4.85, 4.95, 4.97, 5.18, 5.25, 5.59, 5.66, 5.64, 5.44, 5.78, 5.81, 6.19, 6.03, 5.73];
    const pontos: Array<[string, number]> = [];
    mensais("2024-01", fechamentos).forEach(([inicio, fechamento]) => {
      pontos.push([inicio, fechamento - 0.1]); // primeiro dia do mês, diferente do fechamento
      pontos.push([inicio.slice(0, 8) + "20", fechamento]); // dia 20 é o último com dado
    });
    await seedSeries(db, "1", pontos, { unit: "R$", periodicity: "daily" });

    const rows = await rodar("06_dolar_variacao_volatilidade.sql");
    expect(rows).toHaveLength(14);
    expect(num(rows[0].fechamento)).toBe(4.85);
    expect(num(rows[0].media)).toBeCloseTo(4.8, 4);
    expect(rows[0].variacao_mes_pct).toBeNull();
    expect(num(rows[1].variacao_mes_pct)).toBeCloseTo((4.95 / 4.85 - 1) * 100, 2);

    // a primeira janela cheia de 12 variações termina no 13º mês
    expect(rows[11].volatilidade_12m).toBeNull();
    const variacoes = fechamentos.slice(1, 13).map((f, i) => (f / fechamentos[i] - 1) * 100);
    const media = variacoes.reduce((s, v) => s + v, 0) / variacoes.length;
    const desvio = Math.sqrt(variacoes.reduce((s, v) => s + (v - media) ** 2, 0) / (variacoes.length - 1));
    expect(num(rows[12].volatilidade_12m)).toBeCloseTo(desvio, 2);
  });
});

describe("07_saude_do_etl.sql", () => {
  it("resume execuções, falhas e duração por semana", async () => {
    await db.insert(etlRuns).values([
      {
        source: "bcb",
        startedAt: new Date("2026-10-19T03:00:00Z"),
        finishedAt: new Date("2026-10-19T03:00:30Z"),
        status: "success",
        rowsUpserted: 120,
      },
      {
        source: "bcb",
        startedAt: new Date("2026-10-20T03:00:00Z"),
        finishedAt: new Date("2026-10-20T03:00:10Z"),
        status: "error",
        rowsUpserted: 40,
        error: "série 1: timeout",
      },
      {
        source: "bcb",
        startedAt: new Date("2026-10-13T03:00:00Z"),
        finishedAt: new Date("2026-10-13T03:00:20Z"),
        status: "success",
        rowsUpserted: 80,
      },
    ]);

    const rows = await rodar("07_saude_do_etl.sql");
    expect(rows).toHaveLength(2);
    const [recente, anterior] = rows;
    expect(num(recente.execucoes)).toBe(2);
    expect(num(recente.com_erro)).toBe(1);
    expect(num(recente.taxa_sucesso_pct)).toBe(50);
    expect(num(recente.linhas_gravadas)).toBe(160);
    expect(num(recente.duracao_media_s)).toBe(20);
    expect(num(anterior.execucoes)).toBe(1);
  });
});
