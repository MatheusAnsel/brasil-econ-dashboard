"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Legend, formatMonth, formatNumber, type LegendItem } from "../components/chart-kit";
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

  const fatos = data ? resumir(data) : null;

  return (
    <main>
      <header className="topo">
        <span className="marca">Brasil Econ</span>
        <nav>
          <a href="https://github.com/MatheusAnsel/brasil-econ-dashboard">Código</a>
          <a href="https://brasil-econ-api.onrender.com/docs">API</a>
        </nav>
      </header>

      {error && <div className="error">Não foi possível carregar os dados: {error}</div>}
      {!data && !error && (
        <p className="sub">
          {tentativa === 1
            ? "Carregando..."
            : `Acordando a API (hospedagem gratuita), tentativa ${tentativa} de ${MAX_TENTATIVAS}...`}
        </p>
      )}

      {data && fatos && (
        <>
          <h1 className="manchete">
            Com a Selic em <Num cor="var(--series-1)">{fatos.selic}%</Num> ao ano e a inflação em{" "}
            <Num cor="var(--series-2)">{fatos.ipca}%</Num>, o juro real é de{" "}
            <Num cor="var(--series-3)">{fatos.juroReal}%</Num>.
          </h1>
          <p className="manchete-nota">
            Dados do Banco Central do Brasil, {fatos.mesAtual}. O dólar (PTAX venda) está em R$ {fatos.dolar}.
          </p>

          <Painel
            titulo="Selic meta e IPCA em 12 meses"
            texto={`A Selic foi de ${fatos.selicMin.valor}% (${fatos.selicMin.mes}) a ${fatos.selicMax.valor}% (${fatos.selicMax.mes}). Médias mensais, em % ao ano, na mesma escala.`}
            legenda={[
              { label: "Selic meta", color: "var(--series-1)" },
              { label: "IPCA 12 meses", color: "var(--series-2)" },
            ]}
          >
            <TrendChart
              data={data.selicIpca}
              series={[
                { key: "selic", label: "Selic meta", color: "var(--series-1)" },
                { key: "ipca12m", label: "IPCA 12 meses", color: "var(--series-2)" },
              ]}
              unit="%"
              height={320}
              fromZero
              showLegend={false}
            />
          </Painel>

          <Painel
            titulo="Juro real"
            texto={`Selic meta deflacionada pelo IPCA 12m (equação de Fisher). Ficou negativo em ${fatos.mesesNegativos} dos ${fatos.mesesTotal} meses da série.`}
          >
            <RealRateChart data={data.realRate} />
          </Painel>

          <Painel
            titulo="Dólar e Selic"
            texto={`O dólar foi de R$ ${fatos.dolarMin.valor} (${fatos.dolarMin.mes}) a R$ ${fatos.dolarMax.valor} (${fatos.dolarMax.mes}). Os dois gráficos usam o mesmo período, cada um na sua escala.`}
          >
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
          </Painel>

          <Painel
            titulo="Correlação entre Selic e IPCA 12m"
            texto={
              fatos.maior
                ? `Selic hoje contra a inflação daqui a N meses (Pearson). A maior correlação em módulo é ${fatos.maior.valor}, com defasagem de ${fatos.maior.lag} meses.`
                : "Selic hoje contra a inflação daqui a N meses (Pearson)."
            }
          >
            <CorrelationChart data={data.correlations} height={280} />
          </Painel>
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

/** Número em destaque com uma marca na cor da série correspondente (a cor identifica a série; o texto segue a cor do tema). */
function Num({ cor, children }: { cor: string; children: ReactNode }) {
  return (
    <span className="num" style={{ ["--marca" as string]: cor }}>
      {children}
    </span>
  );
}

function Painel({
  titulo,
  texto,
  legenda,
  children,
}: {
  titulo: string;
  texto: string;
  legenda?: LegendItem[];
  children: ReactNode;
}) {
  return (
    <section className="painel">
      <div className="painel-texto">
        <h2>{titulo}</h2>
        <p>{texto}</p>
        {legenda && <Legend items={legenda} />}
      </div>
      <div className="painel-grafico">{children}</div>
    </section>
  );
}

function extremo(pontos: Record<string, string | number>[], chave: string, tipo: "min" | "max") {
  const alvo = pontos.reduce((m, p) => (tipo === "max" ? (Number(p[chave]) > Number(m[chave]) ? p : m) : Number(p[chave]) < Number(m[chave]) ? p : m));
  return { valor: Number(alvo[chave]), mes: formatMonth(String(alvo.date)) };
}

function resumir(d: DashboardData) {
  const ultimo = d.selicIpca[d.selicIpca.length - 1];
  const dolar = d.selicDolar[d.selicDolar.length - 1];
  const juro = d.realRate[d.realRate.length - 1];
  const selicMin = extremo(d.selicIpca, "selic", "min");
  const selicMax = extremo(d.selicIpca, "selic", "max");
  const dolarMin = extremo(d.selicDolar, "dolar", "min");
  const dolarMax = extremo(d.selicDolar, "dolar", "max");
  const maior = d.correlations
    .filter((c): c is { lag: number; correlation: number } => c.correlation !== null)
    .reduce<{ lag: number; correlation: number } | null>(
      (m, c) => (m === null || Math.abs(c.correlation) > Math.abs(m.correlation) ? c : m),
      null,
    );
  return {
    selic: formatNumber(Number(ultimo.selic), 2),
    ipca: formatNumber(Number(ultimo.ipca12m), 2),
    juroReal: formatNumber(juro.realRate, 2),
    dolar: formatNumber(Number(dolar.dolar), 2),
    mesAtual: formatMonth(String(ultimo.date)),
    selicMin: { ...selicMin, valor: formatNumber(selicMin.valor, 2) },
    selicMax: { ...selicMax, valor: formatNumber(selicMax.valor, 2) },
    dolarMin: { ...dolarMin, valor: formatNumber(dolarMin.valor, 2) },
    dolarMax: { ...dolarMax, valor: formatNumber(dolarMax.valor, 2) },
    mesesNegativos: d.realRate.filter((p) => p.realRate < 0).length,
    mesesTotal: d.realRate.length,
    maior: maior ? { lag: maior.lag, valor: formatNumber(maior.correlation, 2) } : null,
  };
}
