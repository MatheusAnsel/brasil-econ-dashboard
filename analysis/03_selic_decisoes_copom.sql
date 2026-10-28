-- 03. Decisões do Copom sobre a Selic
-- Pergunta: quando a meta Selic mudou, para quanto, e quanto tempo cada patamar durou?
-- Fonte: meta Selic (SGS 432), série diária em % ao ano.
--
-- LAG compara cada dia com o anterior; só os dias em que a meta muda viram linha.
-- A variação sai em pontos-base (1 p.p. = 100 bps), que é como o mercado fala.

WITH selic AS (
  SELECT
    o.date,
    o.value                                AS meta,
    lag(o.value) OVER (ORDER BY o.date)    AS meta_anterior
  FROM observations o
  JOIN series s ON s.id = o.series_id
  WHERE s.source = 'bcb' AND s.code = '432'
),
mudancas AS (
  SELECT
    date                                   AS vigente_desde,
    meta_anterior,
    meta                                   AS meta_nova,
    lag(date) OVER (ORDER BY date)         AS mudanca_anterior
  FROM selic
  WHERE meta_anterior IS NOT NULL
    AND meta <> meta_anterior
)
SELECT
  vigente_desde,
  round(meta_anterior, 2)                          AS meta_anterior,
  round(meta_nova, 2)                              AS meta_nova,
  round((meta_nova - meta_anterior) * 100)::int    AS variacao_bps,
  CASE WHEN meta_nova > meta_anterior THEN 'alta' ELSE 'corte' END AS decisao,
  vigente_desde - mudanca_anterior                 AS dias_no_patamar_anterior
FROM mudancas
ORDER BY vigente_desde;
