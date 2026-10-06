"use client";

import { useEffect, useState } from "react";
import { DualAxisChart } from "../components/DualAxisChart";
import { CorrelationChart, RealRateChart } from "../components/SimpleCharts";
import {
  correlation,
  etlStatus,
  listSeries,
  monthlyObservations,
  realRate,
  type EtlRun,
  type RealRatePoint,
} from "../lib/api";
import { mergeByDate } from "../lib/merge";

const LAGS = [0, 3, 6, 9, 12, 18, 24];

interface DashboardData {
  selicIpca: Record<string, string | number>[];
  selicDolar: Record<string, string | number>[];
  realRate: RealRatePoint[];
  correlations: { lag: number; correlation: number | null }[];
  etl: EtlRun | null;
}

async function load(): Promise<DashboardData> {
  const series = await listSeries();
  const byCode = (code: string) => {
    const s = series.find((x) => x.source === "bcb" && x.code === code);
    if (!s) throw new Error(`Série ${code} não encontrada. Rode o ETL.`);
    return s;
  };

  const [selic, ipca12, dolar, rr, corr, etl] = await Promise.all([
    monthlyObservations(byCode("432").id),
    monthlyObservations(byCode("13522").id),
    monthlyObservations(byCode("1").id),
    realRate(),
    Promise.all(LAGS.map((lag) => correlation("432", "13522", lag))),
    etlStatus(),
  ]);

  return {
    selicIpca: mergeByDate(selic, ipca12, "selic", "ipca12m"),
    selicDolar: mergeByDate(selic, dolar, "selic", "dolar"),
    realRate: rr.map((p) => ({ ...p, date: p.date.slice(0, 7) })),
    correlations: corr.map((c) => ({ lag: c.lag, correlation: c.correlation })),
    etl,
  };
}

export default function Page() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main>
      <h1>Brasil Econ Dashboard</h1>
      <p className="sub">Selic, inflação e câmbio com dados do Banco Central do Brasil.</p>

      {error && <div className="error">Não foi possível carregar os dados: {error}</div>}
      {!data && !error && <p className="sub">Carregando...</p>}

      {data && (
        <div className="grid">
          <section className="card">
            <h2>Selic meta vs. IPCA acumulado em 12 meses</h2>
            <p>Médias mensais, em % ao ano.</p>
            <DualAxisChart
              data={data.selicIpca}
              left={{ key: "selic", label: "Selic meta", color: "#1d4ed8" }}
              right={{ key: "ipca12m", label: "IPCA 12m", color: "#dc2626" }}
              unitLeft="%"
              unitRight="%"
            />
          </section>

          <section className="card">
            <h2>Juro real</h2>
            <p>Selic meta deflacionada pelo IPCA 12m (equação de Fisher).</p>
            <RealRateChart data={data.realRate} />
          </section>

          <section className="card">
            <h2>Correlação Selic x IPCA 12m com defasagem</h2>
            <p>Selic hoje contra a inflação daqui a N meses (Pearson).</p>
            <CorrelationChart data={data.correlations} />
          </section>

          <section className="card">
            <h2>Dólar vs. Selic</h2>
            <p>PTAX venda (R$) e Selic meta (% a.a.), médias mensais.</p>
            <DualAxisChart
              data={data.selicDolar}
              left={{ key: "selic", label: "Selic meta", color: "#1d4ed8" }}
              right={{ key: "dolar", label: "Dólar (R$)", color: "#7c3aed" }}
              unitLeft="%"
              unitRight=""
            />
          </section>
        </div>
      )}

      <footer>
        {data?.etl
          ? `Última atualização: ${new Date(data.etl.finishedAt ?? data.etl.startedAt).toLocaleString("pt-BR")} (${data.etl.status}, ${data.etl.rowsUpserted} linhas)`
          : "Sem execuções do ETL registradas."}
      </footer>
    </main>
  );
}
