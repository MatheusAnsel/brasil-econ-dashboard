import { describe, expect, it } from "vitest";
import {
  addMonths,
  alignWithLag,
  correlationWithLag,
  pearson,
  realRate,
  realRateSeries,
} from "./analytics";

describe("addMonths", () => {
  it("avança e recua meses atravessando anos", () => {
    expect(addMonths("2024-11-01", 3)).toBe("2025-02-01");
    expect(addMonths("2024-02-01", -3)).toBe("2023-11-01");
    expect(addMonths("2024-05-01", 0)).toBe("2024-05-01");
  });
});

describe("pearson", () => {
  it("retorna 1 para correlação linear perfeita e -1 para inversa", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1);
  });

  it("retorna null para amostra pequena ou variância zero", () => {
    expect(pearson([1, 2], [1, 2])).toBeNull();
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });
});

describe("correlação com defasagem", () => {
  const a = new Map([
    ["2024-01-01", 1],
    ["2024-02-01", 2],
    ["2024-03-01", 3],
    ["2024-04-01", 4],
  ]);
  // b repete a com atraso de 2 meses
  const b = new Map([
    ["2024-03-01", 1],
    ["2024-04-01", 2],
    ["2024-05-01", 3],
    ["2024-06-01", 4],
  ]);

  it("pareia a[t] com b[t+lag]", () => {
    const { x, y } = alignWithLag(a, b, 2);
    expect(x).toEqual([1, 2, 3, 4]);
    expect(y).toEqual([1, 2, 3, 4]);
  });

  it("encontra a defasagem correta", () => {
    expect(correlationWithLag(a, b, 2).correlation).toBeCloseTo(1);
    expect(correlationWithLag(a, b, 2).n).toBe(4);
  });
});

describe("juro real", () => {
  it("aplica a equação de Fisher", () => {
    expect(realRate(10, 10)).toBeCloseTo(0);
    expect(realRate(15, 5)).toBeCloseTo(9.5238, 3);
  });

  it("só inclui meses presentes nas duas séries, em ordem", () => {
    const selic = new Map([
      ["2024-02-01", 11],
      ["2024-01-01", 11],
      ["2024-03-01", 10.5],
    ]);
    const ipca = new Map([
      ["2024-01-01", 4.5],
      ["2024-02-01", 4.4],
    ]);
    const r = realRateSeries(selic, ipca);
    expect(r.map((p) => p.date)).toEqual(["2024-01-01", "2024-02-01"]);
  });
});
