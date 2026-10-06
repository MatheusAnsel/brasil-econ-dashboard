# brasil-econ-dashboard

Dashboard de indicadores econômicos do Brasil. Um pipeline de ETL coleta séries históricas do Banco Central e do IBGE, grava no PostgreSQL e expõe uma API REST. O front em Next.js apresenta gráficos, comparações e correlações entre as séries, como Selic versus inflação.

## Sobre

O projeto cobre o ciclo completo de um produto de dados: coleta periódica de fontes públicas, modelagem e persistência, API tipada e visualização. A análise central é a correlação com defasagem (lag) entre a taxa Selic e a inflação, além do cálculo do juro real.

## Funcionalidades

- Coleta automática e periódica de séries do Banco Central (SGS), IBGE (SIDRA) e Brasil API
- Carga histórica em blocos, respeitando o limite de janela das séries diárias do SGS
- ETL idempotente: upsert com chave única em `(series_id, data)`, podendo rodar várias vezes sem duplicar dados
- API REST com agregação por período e endpoints de análise
- Gráficos de séries históricas, comparações e correlações
- Indicador de última atualização baseado no registro de execuções do ETL

## Telas

1. Selic versus IPCA acumulado em 12 meses, em eixo duplo, com marcações das reuniões do Copom
2. Juro real ao longo do tempo
3. Correlação com defasagem entre Selic e inflação
4. Dólar versus Selic
5. Rodapé de última atualização, lendo `etl_runs`

## Arquitetura

```
BCB SGS ─┐
IBGE ────┼──> apps/etl ──> PostgreSQL ──> apps/api ──> apps/web
Brasil API ┘   (collectors)   (Supabase)   (Fastify)    (Next.js)
```

```
apps/
  api/   Node + TypeScript, Fastify, Zod, Drizzle ou Prisma
  etl/   Job de coleta; um collector por fonte, todos gravando em formato único
  web/   Next.js com Recharts ou ECharts
```

## Séries iniciais (BCB SGS)

| Série | Código |
| --- | --- |
| Selic meta | 432 |
| Selic diária | 11 |
| IPCA mensal | 433 |
| IPCA acumulado em 12 meses | 13522 |
| Dólar (PTAX venda) | 1 |

Padrão de consulta:

```
https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json&dataInicial=dd/MM/aaaa&dataFinal=dd/MM/aaaa
```

Séries diárias têm limite de janela por consulta (cerca de 10 anos), então a carga inicial é feita em blocos. Do IBGE entram, via SIDRA, o IPCA detalhado por grupo e o PIB. A Brasil API complementa com taxas e câmbio.

## Modelo de dados

- `series`: id, código, fonte, nome, unidade, periodicidade
- `observations`: series_id, data, valor, com chave única em `(series_id, data)`
- `etl_runs`: fonte, início, fim, status, linhas inseridas

## Endpoints

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/series` | Lista as séries disponíveis |
| GET | `/series/:id/observations?from=&to=&agg=month` | Observações com filtro de período e agregação |
| GET | `/analytics/correlation?a=432&b=13522&lag=6` | Correlação entre duas séries com defasagem |
| GET | `/analytics/real-rate` | Juro real (Selic menos IPCA 12m) |

## Stack

- Backend: Node.js, TypeScript, Fastify, Zod, Drizzle ou Prisma
- Banco: PostgreSQL
- Frontend: Next.js, Recharts ou ECharts
- Deploy: Vercel (front), Render (API e cron job) e Supabase (PostgreSQL)

## Roadmap

- [ ] Schema e collector do BCB (Selic e IPCA) com carga histórica
- [ ] API com os endpoints de séries
- [ ] Primeiro gráfico no Next.js, já publicado
- [ ] Cron diário, depois IBGE e Brasil API
- [ ] Camada de analytics (correlação e juro real)
- [ ] Diagrama de arquitetura e documentação final

## Como rodar localmente

```bash
git clone https://github.com/MatheusAnsel/brasil-econ-dashboard.git
cd brasil-econ-dashboard
cp .env.example .env   # defina DATABASE_URL
npm install
npm run dev
```

Os comandos acima serão ajustados conforme o scaffold do monorepo for criado.

## Fontes de dados

- [Banco Central do Brasil, SGS](https://dadosabertos.bcb.gov.br/)
- [IBGE, API SIDRA](https://servicodados.ibge.gov.br/api/docs)
- [Brasil API](https://brasilapi.com.br/)

## Autor

Matheus Ansel, desenvolvedor full-stack. Portfólio: [matheusansel-dev.vercel.app](https://matheusansel-dev.vercel.app)
