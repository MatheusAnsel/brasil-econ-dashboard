# Decisões de arquitetura (ADRs)

Registros curtos das decisões que moldam o projeto: o contexto, o que foi escolhido e o que se ganha e se perde com isso.

| # | Decisão |
|---|---|
| [0001](0001-etl-idempotente-com-upsert.md) | ETL idempotente: upsert sobre chave composta e reprocessamento dos últimos 60 dias |
| [0002](0002-cache-versionado-pelo-etl.md) | Cache em Redis versionado pelo último ETL e que nunca derruba a API |
| [0003](0003-etl-agendado-dentro-da-api.md) | ETL agendado dentro da própria API, sem cron externo |
