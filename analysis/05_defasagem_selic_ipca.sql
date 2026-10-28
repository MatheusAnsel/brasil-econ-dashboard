-- 05. Em quanto tempo a Selic chega na inflação?
-- Pergunta: a Selic de hoje se relaciona mais com o IPCA de quantos meses à frente?
-- Fontes: meta Selic (SGS 432) e IPCA 12m (SGS 13522), em média mensal.
--
-- Para cada defasagem de 0 a 24 meses, pareia Selic[mês] com IPCA[mês + defasagem]
-- e calcula a correlação de Pearson (função corr do PostgreSQL).
-- Leitura: correlação mais negativa = juro alto acompanhado de inflação menor depois de N meses.
-- Correlação não é causalidade: as duas séries também respondem a choques externos.

WITH mensal AS (
  SELECT
    s.code,
    date_trunc('month', o.date)::date AS mes,
    avg(o.value)::float8              AS valor
  FROM observations o
  JOIN series s ON s.id = o.series_id
  WHERE s.source = 'bcb' AND s.code IN ('432', '13522')
  GROUP BY s.code, 2
),
selic AS (SELECT mes, valor FROM mensal WHERE code = '432'),
ipca  AS (SELECT mes, valor FROM mensal WHERE code = '13522')
SELECT
  d.defasagem                                     AS defasagem_meses,
  count(*)                                        AS pares,
  round(corr(selic.valor, ipca.valor)::numeric, 4) AS correlacao
FROM generate_series(0, 24) AS d(defasagem)
JOIN selic ON true
JOIN ipca  ON ipca.mes = (selic.mes + make_interval(months => d.defasagem))::date
GROUP BY d.defasagem
ORDER BY d.defasagem;
