-- 02. Inflação (IPCA) acumulada por ano
-- Pergunta: qual foi a inflação de cada ano e quais anos foram os piores?
-- Fonte: IPCA mensal (SGS 433), em % ao mês.
--
-- A inflação do ano não é a soma dos meses: é composta.
-- Acumulado = (1 + m1/100) x (1 + m2/100) x ... - 1. O produto é calculado como exp(soma(ln(1 + x))).
-- Anos com menos de 12 meses (o ano corrente) aparecem com a coluna meses < 12 e ficam fora do ranking.

WITH ipca AS (
  SELECT o.date, o.value AS ipca_mes
  FROM observations o
  JOIN series s ON s.id = o.series_id
  WHERE s.source = 'bcb' AND s.code = '433'
),
por_ano AS (
  SELECT
    extract(year FROM date)::int                                   AS ano,
    count(*)                                                       AS meses,
    (exp(sum(ln(1 + ipca_mes / 100))) - 1) * 100                   AS acumulado,
    max(ipca_mes)                                                  AS maior_mes,
    (array_agg(to_char(date, 'MM') ORDER BY ipca_mes DESC))[1]     AS mes_mais_alto,
    count(*) FILTER (WHERE ipca_mes < 0)                           AS meses_com_deflacao
  FROM ipca
  GROUP BY 1
)
SELECT
  ano,
  meses,
  round(acumulado, 2)  AS ipca_acumulado_ano,
  round(maior_mes, 2)  AS maior_ipca_mensal,
  mes_mais_alto,
  meses_com_deflacao,
  CASE WHEN meses = 12
       THEN rank() OVER (PARTITION BY meses = 12 ORDER BY acumulado DESC)
  END                  AS ranking_ano_fechado
FROM por_ano
ORDER BY ano;
