"use client";

import { useEffect, useState } from "react";
import { formatMonth, formatNumber } from "../components/chart-kit";
import { TrendChart } from "../components/DualAxisChart";
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
const MAX_TENTATIVAS = 6;
const ESPERA_MS = 10_000;

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
  const [tentativa, setTentativa] = useState(1);

  useEffect(() => {
    let ativo = true;
    // A API no plano gratuito dorme quando fica sem uso; a primeira chamada pode levar cerca de um minuto.
    // Por isso tenta algumas vezes antes de mostrar o erro.
    const carregar = async (n: number) => {
      try {
        const d = await load();
        if (ativo) setData(d);
      } catch (e) {
        if (!ativo) return;
        if (n < MAX_TENTATIVAS) {
          setTentativa(n + 1);
          setTimeout(() => void carregar(n + 1), ESPERA_MS);
        } else {
          setError((e as Error).message);
        }
      }
    };
    void carregar(1);
    return () => {
      ativo = false;
    };
  }, []);

  const ultimo = data?.selicIpca.at(-1);
  const ultimoDolar = data?.selicDolar.at(-1);
  const ultimoJuro = data?.realRate.at(-1);
  const maior = data?.correlations
    .filter((c): c is { lag: number; correlation: number } => c.correlation !== null)
    .reduce<{ lag: number; correlation: number } | null>(
      (m, c) => (m === null || Math.abs(c.correlation) > Math.abs(m.correlation) ? c : m),
      null,
    );

  return (
    <main>
      <h1>Brasil Econ Dashboard</h1>
      <p className="sub">Selic, inflação, juro real e câmbio com dados do Banco Central do Brasil.</p>

      {error && <div className="error">Não foi possível carregar os dados: {error}</div>}
      {!data && !error && (
        <p className="sub">
          {tentativa === 1
            ? "Carregando..."
            : `Acordando a API (hospedagem gratuita), tentativa ${tentativa} de ${MAX_TENTATIVAS}...`}
        </p>
      )}

      {data && ultimo && ultimoDolar && ultimoJuro && (
        <>
          <section className="kpis" aria-label="Valores mais recentes">
            <Kpi label="Selic meta" value={`${formatNumber(Number(ultimo.selic), 2)}%`} note="ao ano" />
            <Kpi label="IPCA em 12 meses" value={`${formatNumber(Number(ultimo.ipca12m), 2)}%`} note={formatMonth(String(ultimo.date))} />
            <Kpi label="Juro real" value={`${formatNumber(ultimoJuro.realRate, 2)}%`} note="Selic deflacionada pelo IPCA 12m" />
            <Kpi label="Dólar (PTAX venda)" value={`R$ ${formatNumber(Number(ultimoDolar.dolar), 2)}`} note={`média de ${formatMonth(String(ultimoDolar.date))}`} />
          </section>

          <div className="grid">
            <section className="card">
              <h2>Selic meta vs. IPCA em 12 meses</h2>
              <p>Médias mensais, em % ao ano, na mesma escala.</p>
              <TrendChart
                data={data.selicIpca}
                series={[
                  { key: "selic", label: "Selic meta", color: "var(--series-1)" },
                  { key: "ipca12m", label: "IPCA 12 meses", color: "var(--series-2)" },
                ]}
                unit="%"
                fromZero
              />
            </section>

            <section className="card">
              <h2>Juro real</h2>
              <p>Selic meta deflacionada pelo IPCA 12m (equação de Fisher).</p>
              <RealRateChart data={data.realRate} />
            </section>

            <section className="card">
              <h2>Correlação entre Selic e IPCA 12m</h2>
              <p>
                Selic hoje contra a inflação daqui a N meses (Pearson).
                {maior && (
                  <>
                    {" "}
                    Maior correlação em módulo: <strong>{formatNumber(maior.correlation, 2)}</strong> com {maior.lag} meses.
                  </>
                )}
              </p>
              <CorrelationChart data={data.correlations} height={340} />
            </section>

            <section className="card">
              <h2>Dólar e Selic</h2>
              <p>Dois gráficos com o mesmo período, cada um na sua escala: PTAX venda (R$) e Selic meta (% ao ano).</p>
              <TrendChart
                data={data.selicDolar}
                series={[{ key: "selic", label: "Selic meta", color: "var(--series-1)" }]}
                unit="%"
                height={150}
                hideXAxis
                syncId="dolar-selic"
                fromZero
                yWidth={68}
                caption="Selic meta (% ao ano)"
              />
              <TrendChart
                data={data.selicDolar}
                series={[{ key: "dolar", label: "Dólar (PTAX venda)", color: "var(--series-4)" }]}
                prefix="R$ "
                decimals={2}
                height={190}
                syncId="dolar-selic"
                yWidth={68}
                caption="Dólar, PTAX venda (R$)"
              />
            </section>
          </div>
        </>
      )}

      <footer>
        {data?.etl
          ? `Última atualização: ${new Date(data.etl.finishedAt ?? data.etl.startedAt).toLocaleString("pt-BR")} (${data.etl.status}, ${data.etl.rowsUpserted} linhas)`
          : "Sem execuções do ETL registradas."}
      </footer>
    </main>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-note">{note}</div>
    </div>
  );
}
