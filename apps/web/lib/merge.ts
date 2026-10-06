import type { Point } from "./api";

/** Une duas séries mensais pela data, mantendo só os meses presentes nas duas. */
export function mergeByDate(a: Point[], b: Point[], keyA: string, keyB: string) {
  const mb = new Map(b.map((p) => [p.date, p.value]));
  return a
    .filter((p) => mb.has(p.date))
    .map((p) => ({ date: p.date.slice(0, 7), [keyA]: p.value, [keyB]: mb.get(p.date)! }));
}
