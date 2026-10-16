import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { etlRuns } from "@econ/db";
import { lastSuccessAt, startEtlScheduler } from "./etl-scheduler";
import { resetDb, testDb } from "../../../test/helpers";

const { db, pool } = testDb();
afterAll(() => pool.end());
beforeEach(() => resetDb(db));

const silencioso = { info: () => {}, error: () => {} };
const HORA = 60 * 60 * 1000;

async function sucessoHa(horas: number) {
  await db.insert(etlRuns).values({ source: "bcb", status: "success", finishedAt: new Date(Date.now() - horas * HORA) });
}

function agendador(run: () => Promise<{ ok: boolean }>, extra = {}) {
  // intervalo enorme: os testes chamam tick() à mão
  return startEtlScheduler(db, { run, intervalMs: 24 * HORA, log: silencioso, ...extra });
}

describe("agendamento do ETL", () => {
  it("lastSuccessAt é null sem execuções e ignora as que terminaram com erro", async () => {
    expect(await lastSuccessAt(db)).toBeNull();
    await db.insert(etlRuns).values({ source: "bcb", status: "error", finishedAt: new Date() });
    expect(await lastSuccessAt(db)).toBeNull();
    await sucessoHa(2);
    expect(await lastSuccessAt(db)).toBeInstanceOf(Date);
  });

  it("faz a primeira carga quando nunca houve ETL", async () => {
    const run = vi.fn().mockResolvedValue({ ok: true });
    const s = agendador(run);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    s.stop();
  });

  it("não roda quando o último sucesso é recente", async () => {
    await sucessoHa(3);
    const run = vi.fn().mockResolvedValue({ ok: true });
    const s = agendador(run);
    expect(await s.tick()).toBe(false);
    expect(run).not.toHaveBeenCalled();
    s.stop();
  });

  it("roda quando o último sucesso tem mais de 24 horas", async () => {
    await sucessoHa(30);
    const run = vi.fn().mockResolvedValue({ ok: true });
    const s = agendador(run);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    s.stop();
  });

  it("respeita a idade máxima configurada e o relógio injetado", async () => {
    await sucessoHa(1);
    const run = vi.fn().mockResolvedValue({ ok: true });
    const s = agendador(run, { maxAgeMs: 30 * 60 * 1000, now: () => Date.now() });
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    s.stop();
  });

  it("nunca roda dois ETL ao mesmo tempo", async () => {
    let liberar!: () => void;
    const run = vi
      .fn()
      .mockImplementationOnce(() => new Promise<{ ok: boolean }>((r) => (liberar = () => r({ ok: true }))))
      .mockResolvedValue({ ok: true });
    const s = agendador(run);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(await s.tick()).toBe(false);
    liberar();
    await vi.waitFor(async () => expect(await s.tick()).toBe(true));
    s.stop();
  });

  it("uma falha do ETL é registrada e não derruba o processo", async () => {
    const erros: string[] = [];
    const run = vi.fn().mockRejectedValue(new Error("BCB fora do ar"));
    const s = agendador(run, { log: { info: () => {}, error: (m: string) => erros.push(m) } });
    await vi.waitFor(() => expect(erros.some((m) => m.includes("BCB fora do ar"))).toBe(true));
    s.stop();
  });

  it("registra quando o ETL termina com erros parciais", async () => {
    const infos: string[] = [];
    const run = vi.fn().mockResolvedValue({ ok: false });
    const s = agendador(run, { log: { info: (m: string) => infos.push(m), error: () => {} } });
    await vi.waitFor(() => expect(infos.some((m) => m.includes("com erros"))).toBe(true));
    s.stop();
  });
});
