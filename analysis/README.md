# Análises em SQL

Consultas analíticas sobre o banco do projeto, escritas em PostgreSQL e comentadas com a pergunta de negócio que cada uma responde. Todas rodam no mesmo banco que o ETL alimenta, sem tabela auxiliar.

| Arquivo | Pergunta | Técnicas |
| --- | --- | --- |
| [01_cobertura_e_qualidade.sql](01_cobertura_e_qualidade.sql) | Quais séries estão no banco, de quando até quando, e há meses sem dado? | `LEFT JOIN`, `COUNT DISTINCT`, cálculo de meses esperados |
| [02_ipca_acumulado_por_ano.sql](02_ipca_acumulado_por_ano.sql) | Qual foi a inflação de cada ano e quais anos foram os piores? | inflação composta com `exp(sum(ln(1 + x)))`, `FILTER`, `RANK` |
| [03_selic_decisoes_copom.sql](03_selic_decisoes_copom.sql) | Quando a meta Selic mudou, para quanto, e quanto durou cada patamar? | `LAG` em duas etapas, variação em pontos-base |
| [04_juro_real_mensal.sql](04_juro_real_mensal.sql) | Quanto a Selic rendeu acima da inflação em cada mês? | médias mensais, pivô com `FILTER`, equação de Fisher |
| [05_defasagem_selic_ipca.sql](05_defasagem_selic_ipca.sql) | A Selic de hoje se relaciona mais com o IPCA de quantos meses à frente? | `generate_series`, `make_interval`, `corr` (Pearson) |
| [06_dolar_variacao_volatilidade.sql](06_dolar_variacao_volatilidade.sql) | Quanto o dólar variou em cada mês e quão instável esteve no último ano? | fechamento com `array_agg ... ORDER BY`, janela móvel de 12 meses, `stddev_samp` |
| [07_saude_do_etl.sql](07_saude_do_etl.sql) | A carga de dados está rodando, com que frequência falha e quanto demora? | `date_trunc` por semana, taxa de sucesso, duração média |

## Como rodar

Com o banco local do projeto (veja "Como rodar localmente" no README principal) e o ETL já executado:

```bash
psql "$DATABASE_URL" -f analysis/04_juro_real_mensal.sql
```

Para levar o resultado para o Excel:

```bash
psql "$DATABASE_URL" --csv -f analysis/02_ipca_acumulado_por_ano.sql > ipca_por_ano.csv
```

## Testes

[analysis.test.ts](analysis.test.ts) roda cada consulta contra o PostgreSQL de testes com dados conhecidos e confere o resultado. As consultas de juro real e de defasagem são comparadas com as funções da API (`realRate`, `pearson` e `alignWithLag`), então o SQL e o endpoint não podem divergir sem quebrar o CI.

Os testes entram no `npm test` junto com o resto da suíte.

## Cuidados na leitura

- **Inflação do ano é composta, não somada.** Somar os IPCAs mensais subestima o resultado quando a inflação é alta.
- **Juro real usa Fisher.** `Selic - IPCA` aparece na coluna `diferenca_simples` só para comparação.
- **Correlação não é causalidade.** Selic e IPCA também respondem a choques externos (câmbio, commodities, pandemia), e uma correlação alta numa defasagem não prova o efeito da política monetária.
- **A Selic e o dólar são diários.** Nas análises mensais entra a média do mês (Selic, dólar médio) ou o último dia com dado (fechamento do dólar).
