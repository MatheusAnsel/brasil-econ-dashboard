import "@econ/db/src/env";
import { createDb } from "@econ/db";
import { runBcb } from "./etl";

const { db, pool } = createDb();
const { ok } = await runBcb(db, { defaultStart: process.env.ETL_START_DATE });
await pool.end();
process.exit(ok ? 0 : 1);
