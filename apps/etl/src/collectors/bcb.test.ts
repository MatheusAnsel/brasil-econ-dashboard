import { describe, expect, it } from "vitest";
import { brToIso, buildWindows, parseSgsRows } from "./bcb";

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
