import { sql } from "drizzle-orm";
import { createDb, observations, series, type Db } from "@econ/db";
import type { Cache } from "../apps/api/src/cache";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/econ_test";

/** Os testes apagam dados: só rodam em um banco cujo nome termina em _test. */
export function assertTestDatabase(url: string) {
  const name = new URL(url).pathname.replace("/", "");
  if (!name.endsWith("_test")) {
    throw new Error(`Recusando rodar testes em "${name}": o banco de testes deve terminar em _test`);
  }
}

export function testDb() {
  assertTestDatabase(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.DATABASE_SSL = "false";
  return createDb();
}

export async function resetDb(db: Db) {
  await db.execute(sql`TRUNCATE etl_runs, observations, series RESTART IDENTITY CASCADE`);
}

/** Cria uma série do BCB com observações [data, valor] e devolve o id. */
export async function seedSeries(
  db: Db,
  code: string,
  points: Array<[string, number]>,
  meta: { name?: string; unit?: string; periodicity?: string } = {},
): Promise<number> {
  const [s] = await db
    .insert(series)
    .values({
      source: "bcb",
      code,
      name: meta.name ?? `Série ${code}`,
      unit: meta.unit ?? "% a.a.",
      periodicity: meta.periodicity ?? "monthly",
    })
    .returning();
  if (points.length) {
    await db
      .insert(observations)
      .values(points.map(([date, value]) => ({ seriesId: s.id, date, value: String(value) })));
  }
  return s.id;
}

/** Cache em memória para testar HIT/MISS sem Redis. */
export class MemoryCache implements Cache {
  readonly enabled = true;
  store = new Map<string, string>();
  gets = 0;
  sets = 0;
  async get(key: string) {
    this.gets++;
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.sets++;
    this.store.set(key, value);
  }
  async ping() {
    return true;
  }
  async close() {}
}

/** Gera [data, valor] mensais consecutivos a partir de um mês. */
export function mensais(inicio: string, valores: number[]): Array<[string, number]> {
  const [ano, mes] = inicio.split("-").map(Number);
  return valores.map((v, i) => {
    const d = new Date(Date.UTC(ano, mes - 1 + i, 1));
    return [d.toISOString().slice(0, 10), v] as [string, number];
  });
}
