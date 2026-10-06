import "@econ/db/src/env";
import { createDb } from "@econ/db";
import { buildApp } from "./app";

const { db, pool } = createDb();
const app = await buildApp(db);

const port = Number(process.env.PORT ?? 3333);
try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  await pool.end();
  process.exit(1);
}
