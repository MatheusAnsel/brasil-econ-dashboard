# 0002. Cache em Redis versionado pelo último ETL e que nunca derruba a API

**Status:** aceita

## Contexto
As rotas de agregação e análise (médias mensais, correlação com defasagem, juro real) leem milhares de observações a cada chamada, mas os dados só mudam quando um ETL termina. Um cache com prazo fixo serviria dados velhos depois de uma carga nova. Apagar as chaves ao fim do ETL obrigaria o ETL a conhecer o Redis e a coordenar com a API, e uma falha nesse passo deixaria o cache inconsistente.

## Decisão
- A chave de cada resposta inclui a versão dos dados, que é o horário do último ETL com sucesso em `etl_runs`: `econ:v1:{versão}:{rota e parâmetros}` (`apps/api/src/cache.ts`).
- As entradas valem por até 1 hora. Quando um ETL novo termina, a versão muda, as chaves antigas deixam de ser lidas e expiram sozinhas.
- O cache é opcional. Sem `REDIS_URL`, ele fica desligado. Com o Redis fora do ar, qualquer erro vira "miss" e a resposta sai do banco. O cliente do Redis não enfileira comandos offline, para não atrasar a resposta.
- Cada resposta informa `x-cache: HIT`, `MISS` ou `BYPASS`, e o `/ready` mostra o estado do cache.

## Consequências
- O ETL não sabe que o cache existe. A invalidação vem dos próprios dados, sem apagar chaves e sem condição de corrida entre os dois processos.
- Uma queda do Redis deixa a API mais lenta, mas não fora do ar.
- Cada requisição em cache faz uma consulta leve ao banco para ler a versão. É o preço de nunca servir resultado de uma carga antiga.
- Logo depois de um ETL, a primeira chamada de cada rota volta a calcular tudo. Com o volume atual, isso não pesa.
