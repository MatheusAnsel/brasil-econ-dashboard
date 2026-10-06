import { desc } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { etlRuns, type Db } from "@econ/db";

export const etlRoutes =
  (db: Db): FastifyPluginAsync =>
  async (app) => {
    // GET /etl/status: alimenta o rodapé "última atualização" do front.
    app.get("/status", async () => {
      const [last] = await db.select().from(etlRuns).orderBy(desc(etlRuns.startedAt)).limit(1);
      return last ?? null;
    });
  };
