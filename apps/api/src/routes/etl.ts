import { desc } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { etlRuns, type Db } from "@econ/db";
import { etlRunItem } from "../docs";

export const etlRoutes =
  (db: Db): FastifyPluginAsync =>
  async (app) => {
    // GET /etl/status: alimenta o rodapé "última atualização" do front.
    app.get(
      "/status",
      {
        schema: {
          tags: ["ETL"],
          summary: "Última execução do ETL",
          response: { 200: etlRunItem },
        },
      },
      async () => {
        const [last] = await db.select().from(etlRuns).orderBy(desc(etlRuns.startedAt)).limit(1);
        return last ?? null;
      },
    );
  };
