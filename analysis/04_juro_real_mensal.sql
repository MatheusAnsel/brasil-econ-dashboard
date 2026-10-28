-- 04. Juro real mensal (equação de Fisher)
-- Pergunta: quanto a Selic rendeu acima da inflação em cada mês?
-- Fontes: meta Selic (SGS 432) e IPCA acumulado em 12 meses (SGS 13522), em média mensal.
--
-- Juro real = ((1 + Selic/100) / (1 + IPCA 12m/100) - 1) x 100.
-- Subtrair (Selic - IPCA) é só uma aproximação; Fisher é a conta exata.
-- É o mesmo cálculo do endpoint GET /analytics/real-rate (o teste analysis.test.ts confere).

WITH mensal AS (
  SELECT
    s.code,
    date_trunc('month', o.date)::date AS mes,
    avg(o.value)                      AS valor
  FROM observations o
  JOIN series s ON s.id = o.series_id
  WHERE s.source = 'bcb' AND s.code IN ('432', '13522')
  GROUP BY s.code, 2
),
lado_a_lado AS (
  SELECT
    mes,
    max(valor) FILTER (WHERE code = '432')   AS selic,
    max(valor) FILTER (WHERE code = '13522') AS ipca_12m
  FROM mensal
  GROUP BY mes
)
SELECT
  mes,
  round(selic, 2)                                            AS selic,
  round(ipca_12m, 2)                                         AS ipca_12m,
  round(((1 + selic / 100) / (1 + ipca_12m / 100) - 1) * 100, 2) AS juro_real,
  round(selic - ipca_12m, 2)                                 AS diferenca_simples
FROM lado_a_lado
WHERE selic IS NOT NULL
  AND ipca_12m IS NOT NULL
ORDER BY mes;
