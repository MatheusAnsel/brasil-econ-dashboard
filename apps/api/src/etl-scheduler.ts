import { sql } from "drizzle-orm";
import { etlRuns, type Db } from "@econ/db";
import { runBcb } from "@econ/etl/src/etl";

const HORA = 60 * 60 * 1000;

export interface SchedulerOptions {
  /** Executa o ETL. Injetável para testar sem rede. */
  run?: () => Promise<{ ok: boolean }>;
  /** Idade máxima do último ETL com sucesso antes de rodar de novo. Padrão: 24 horas. */
  maxAgeMs?: number;
  /** Intervalo entre as verificações. Padrão: 1 hora. */
  intervalMs?: number;
  /** Data inicial da carga histórica (yyyy-mm-dd), usada só na primeira carga. */
  defaultStart?: string;
  now?: () => number;
  log?: Pick<Console, "info" | "error">;
}

export interface EtlScheduler {
  /** Verifica se o ETL está atrasado e, se estiver, executa. Devolve true quando executou. */
  tick(): Promise<boolean>;
  stop(): void;
}

/** Quando terminou o último ETL com sucesso, ou null se nunca houve. */
export async function lastSuccessAt(db: Db): Promise<Date | null> {
  const [row] = await db
    .select({ at: sql<string | null>`max(${etlRuns.finishedAt})` })
    .from(etlRuns)
    .where(sql`${etlRuns.status} = 'success'`);
  return row?.at ? new Date(row.at) : null;
}

/**
 * Mantém os dados em dia sem um cron externo: ao subir e a cada hora, roda o ETL se o último
 * sucesso tem mais de 24 horas. Em hospedagem que hiberna por inatividade, a verificação acontece
 * assim que a API acorda. Nunca roda dois ETL ao mesmo tempo e nunca derruba a API.
 */
export function startEtlScheduler(db: Db, options: SchedulerOptions = {}): EtlScheduler {
  const {
    maxAgeMs = 24 * HORA,
    intervalMs = HORA,
    defaultStart,
    now = Date.now,
    log = console,
  } = options;
  const run = options.run ?? (() => runBcb(db, { defaultStart }));
  let running = false;

  async function tick(): Promise<boolean> {
    if (running) return false;
    running = true;
    try {
      const last = await lastSuccessAt(db);
      if (last && now() - last.getTime() < maxAgeMs) return false;
      log.info("ETL agendado: dados com mais de 24 horas (ou primeira carga), atualizando");
      const result = await run();
      log.info(`ETL agendado terminou: ${result.ok ? "sucesso" : "com erros"}`);
      return true;
    } catch (err) {
      log.error(`ETL agendado falhou: ${(err as Error).message}`);
      return true;
    } finally {
      running = false;
    }
  }

  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return { tick, stop: () => clearInterval(timer) };
}
