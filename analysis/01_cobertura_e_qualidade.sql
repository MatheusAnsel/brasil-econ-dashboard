-- 01. Cobertura e qualidade das séries
-- Pergunta: quais séries estão no banco, de quando até quando, e há meses sem dado?
-- Uso: antes de qualquer análise, para saber se a base está completa.
--
-- meses_esperados conta todos os meses entre a primeira e a última data.
-- Se meses_sem_dado > 0, a série tem buraco e as médias mensais daquele período não existem.

WITH base AS (
  SELECT
    s.code,
    s.name,
    s.unit,
    s.periodicity,
    count(o.date)                                  AS observacoes,
    min(o.date)                                    AS primeira_data,
    max(o.date)                                    AS ultima_data,
    count(DISTINCT date_trunc('month', o.date))    AS meses_com_dado
  FROM series s
  LEFT JOIN observations o ON o.series_id = s.id
  GROUP BY s.id
)
SELECT
  code,
  name,
  unit,
  periodicity,
  observacoes,
  primeira_data,
  ultima_data,
  meses_com_dado,
  -- diferença em meses entre o primeiro e o último mês, contando os dois
  ((extract(year FROM ultima_data) - extract(year FROM primeira_data)) * 12
    + extract(month FROM ultima_data) - extract(month FROM primeira_data) + 1)::int AS meses_esperados,
  ((extract(year FROM ultima_data) - extract(year FROM primeira_data)) * 12
    + extract(month FROM ultima_data) - extract(month FROM primeira_data) + 1)::int
    - meses_com_dado::int                                                          AS meses_sem_dado
FROM base
ORDER BY code;
