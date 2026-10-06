import type { NewSeries } from "@econ/db";

// Séries do Banco Central (SGS). Os códigos seguem o catálogo do SGS.
export const BCB_SERIES: NewSeries[] = [
  { source: "bcb", code: "432", name: "Meta Selic", unit: "% a.a.", periodicity: "daily" },
  { source: "bcb", code: "11", name: "Selic diária", unit: "% a.d.", periodicity: "daily" },
  { source: "bcb", code: "433", name: "IPCA mensal", unit: "% a.m.", periodicity: "monthly" },
  {
    source: "bcb",
    code: "13522",
    name: "IPCA acumulado em 12 meses",
    unit: "% a.a.",
    periodicity: "monthly",
  },
  { source: "bcb", code: "1", name: "Dólar (PTAX venda)", unit: "R$", periodicity: "daily" },
];
