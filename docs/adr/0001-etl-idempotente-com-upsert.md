# 0001. ETL idempotente: upsert sobre chave composta e reprocessamento dos últimos 60 dias

**Status:** aceita

## Contexto
O ETL roda várias vezes: na carga inicial, a cada dia pelo agendador e sempre que alguém executa `npm run etl` à mão. Pode cair no meio por uma falha de rede no SGS. Além disso, o Banco Central revisa valores já publicados (o IPCA é o caso mais comum), então baixar apenas o que é posterior à última data gravada perderia essas correções.

## Decisão
- `observations` tem chave primária em `(series_id, date)`. Toda escrita é `INSERT ... ON CONFLICT DO UPDATE`, em lotes de 1000 linhas.
- Quando a série já tem dados, a coleta começa 60 dias antes da última data gravada (`REPROCESS_DAYS` em `apps/etl/src/etl.ts`). Sem dados, começa na data da carga histórica.
- As séries são processadas uma a uma, e uma série que falha não interrompe as outras. O resultado vai para `etl_runs` com status `error` e a mensagem de cada falha.

## Consequências
- Rodar o job duas vezes, ou de novo depois de uma queda, dá o mesmo resultado que rodar uma vez. Nenhum dado duplica e não é preciso limpar nada antes.
- Revisões dentro da janela de 60 dias entram sozinhas. Uma revisão mais antiga que isso só seria corrigida por uma recarga completa.
- Cada execução regrava cerca de 60 dias por série, mesmo sem mudança. Com 5 séries, o custo é pequeno.
- Como a escrita não depende de estado anterior, os testes rodam o pipeline inteiro contra um PostgreSQL real, com o coletor injetado e sem acesso à internet.
