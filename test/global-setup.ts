import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { fileURLToPath } from "node:url";
import { TEST_DATABASE_URL, assertTestDatabase } from "./helpers";

// Aplica as migrações uma única vez antes de toda a suíte.
export default async function setup() {
  assertTestDatabase(TEST_DATABASE_URL);
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL("../packages/db/drizzle", import.meta.url)),
  });
  await pool.end();
}
