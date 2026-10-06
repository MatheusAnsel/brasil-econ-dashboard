import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { requireEnv } from "./env";
import * as schema from "./schema";

export function createDb() {
  const pool = new pg.Pool({
    connectionString: requireEnv("DATABASE_URL"),
    // Supabase exige SSL; localmente (docker) não.
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  return { db: drizzle(pool, { schema }), pool };
}

export type Db = ReturnType<typeof createDb>["db"];
