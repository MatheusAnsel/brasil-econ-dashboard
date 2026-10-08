import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brToIso, buildWindows, collectBcbSeries, parseSgsRows } from "./bcb";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("buildWindows", () => {
  it("divide períodos longos em janelas de até 9 anos sem lacunas", () => {
    const w = buildWindows(new Date("2000-01-01T00:00:00Z"), new Date("2026-10-06T00:00:00Z"));
    expect(w.map(([a, b]) => [iso(a), iso(b)])).toEqual([
      ["2000-01-01", "2008-12-31"],
      ["2009-01-01", "2017-12-31"],
      ["2018-01-01", "2026-10-06"],
    ]);
  });

  it("retorna uma única janela para períodos curtos", () => {
    const w = buildWindows(new Date("2024-01-01T00:00:00Z"), new Date("2024-06-30T00:00:00Z"));
    expect(w).toHaveLength(1);
  });
});

describe("parseSgsRows", () => {
  it("converte datas dd/MM/yyyy para ISO", () => {
    expect(brToIso("05/03/2021")).toBe("2021-03-05");
  });

  it("descarta valores vazios e não numéricos", () => {
    const rows = parseSgsRows([
      { data: "01/01/2024", valor: "10.75" },
      { data: "02/01/2024", valor: "" },
      { data: "03/01/2024", valor: "abc" },
    ]);
    expect(rows).toEqual([{ date: "2024-01-01", value: "10.75" }]);
  });
});

describe("collectBcbSeries (fetch simulado)", () => {
  const resposta = (status: number, corpo: unknown = []) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => corpo }) as Response;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("monta a URL do SGS com as datas em dd/MM/yyyy e converte as linhas", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      resposta(200, [
        { data: "02/01/2024", valor: "11.75" },
        { data: "03/01/2024", valor: "" },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await collectBcbSeries("432", new Date("2024-01-01T00:00:00Z"), new Date("2024-06-30T00:00:00Z"));

    expect(out).toEqual([{ date: "2024-01-02", value: "11.75" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=01/01/2024&dataFinal=30/06/2024",
    );
  });

  it("faz uma requisição por janela de 9 anos e junta os resultados em ordem", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resposta(200, [{ data: "01/06/2005", valor: "1" }]))
      .mockResolvedValueOnce(resposta(200, [{ data: "01/06/2014", valor: "2" }]))
      .mockResolvedValueOnce(resposta(200, [{ data: "01/06/2023", valor: "3" }]));
    vi.stubGlobal("fetch", fetchMock);

    const out = await collectBcbSeries("11", new Date("2000-01-01T00:00:00Z"), new Date("2026-10-06T00:00:00Z"));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(out.map((o) => o.value)).toEqual(["1", "2", "3"]);
  });

  it("tenta de novo com espera crescente quando a rede falha e acaba conseguindo", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(resposta(503))
      .mockResolvedValueOnce(resposta(200, [{ data: "01/01/2024", valor: "5" }]));
    vi.stubGlobal("fetch", fetchMock);

    const promessa = collectBcbSeries("433", new Date("2024-01-01T00:00:00Z"), new Date("2024-02-01T00:00:00Z"));
    await vi.advanceTimersByTimeAsync(2000); // 1a espera: 2s
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000); // 2a espera: 4s
    const out = await promessa;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(out).toEqual([{ date: "2024-01-01", value: "5" }]);
  });

  it("desiste depois de 4 tentativas e propaga o erro de HTTP", async () => {
    const fetchMock = vi.fn().mockResolvedValue(resposta(500));
    vi.stubGlobal("fetch", fetchMock);

    const promessa = collectBcbSeries("433", new Date("2024-01-01T00:00:00Z"), new Date("2024-02-01T00:00:00Z"));
    const verificacao = expect(promessa).rejects.toThrow("HTTP 500");
    await vi.runAllTimersAsync();
    await verificacao;

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
