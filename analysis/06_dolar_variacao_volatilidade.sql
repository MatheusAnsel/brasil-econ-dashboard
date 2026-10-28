-- 06. Dólar: variação mensal e volatilidade
-- Pergunta: quanto o dólar subiu ou caiu em cada mês e quão instável ele esteve no último ano?
-- Fonte: dólar PTAX venda (SGS 1), série diária em R$.
--
-- Fechamento do mês = cotação do último dia útil com dado.
-- Volatilidade 12m = desvio padrão das 12 últimas variações mensais (só aparece com a janela cheia).

WITH mensal AS (
  SELECT
    date_trunc('month', o.date)::date               AS mes,
    avg(o.value)                                    AS media,
    min(o.value)                                    AS minima,
    max(o.value)                                    AS maxima,
    (array_agg(o.value ORDER BY o.date DESC))[1]    AS fechamento
  FROM observations o
  JOIN series s ON s.id = o.series_id
  WHERE s.source = 'bcb' AND s.code = '1'
  GROUP BY 1
),
variacoes AS (
  SELECT
    *,
    (fechamento / lag(fechamento) OVER (ORDER BY mes) - 1) * 100 AS variacao_pct
  FROM mensal
)
SELECT
  mes,
  round(media, 4)        AS media,
  round(minima, 4)       AS minima,
  round(maxima, 4)       AS maxima,
  round(fechamento, 4)   AS fechamento,
  round(variacao_pct, 2) AS variacao_mes_pct,
  CASE WHEN count(variacao_pct) OVER janela = 12
       THEN round(stddev_samp(variacao_pct) OVER janela, 2)
  END                    AS volatilidade_12m
FROM variacoes
WINDOW janela AS (ORDER BY mes ROWS BETWEEN 11 PRECEDING AND CURRENT ROW)
ORDER BY mes;
