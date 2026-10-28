-- 07. Saúde do ETL
-- Pergunta: a carga de dados está rodando, com que frequência falha e quanto demora?
-- Fonte: tabela etl_runs, gravada pelo próprio ETL a cada execução.

SELECT
  date_trunc('week', started_at)::date                              AS semana,
  count(*)                                                          AS execucoes,
  count(*) FILTER (WHERE status = 'success')                        AS com_sucesso,
  count(*) FILTER (WHERE status = 'error')                          AS com_erro,
  round(100.0 * count(*) FILTER (WHERE status = 'success') / count(*), 1) AS taxa_sucesso_pct,
  sum(rows_upserted)                                                AS linhas_gravadas,
  round(avg(extract(epoch FROM finished_at - started_at))::numeric, 1)    AS duracao_media_s,
  max(started_at)                                                   AS ultima_execucao
FROM etl_runs
GROUP BY 1
ORDER BY 1 DESC;
