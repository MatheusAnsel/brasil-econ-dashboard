# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [1.1.1] - 2026-10-21

### Documentação

- Licença MIT
- CHANGELOG com o histórico de versões

## [1.1.0] - 2026-10-16

### Alterado

- Visual editorial: manchete com os números atuais, texto ao lado de cada gráfico e fontes próprias
- Gráficos redesenhados com mesma escala, legenda, tooltip e eixos alinhados

### Documentação

- Capturas de tela do novo visual

## [1.0.0] - 2026-10-16

### Adicionado

- ETL agendado dentro da API e migrações na subida
- Publicação na Render, Supabase e Vercel com demonstração online

### Corrigido

- Front usa a API de produção por padrão e tenta de novo enquanto a API gratuita acorda
- Migração inicial roda em qualquer schema

## [0.2.0] - 2026-10-08

### Adicionado

- Testes de integração do ETL e do coletor contra PostgreSQL real
- OpenAPI, cache Redis, helmet, rate limit e endpoint /ready
- Imagens Docker da API/ETL e do front, compose e CI com serviços reais

### Corrigido

- Agregação agg=month/year retornava erro 500

## [0.1.0] - 2026-10-06

### Adicionado

- Monorepo com schema do banco, coletor de dados do Banco Central e API base
- Frontend Next.js com gráficos, análises, testes e CI

[1.1.1]: https://github.com/MatheusAnsel/brasil-econ-dashboard/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/MatheusAnsel/brasil-econ-dashboard/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/MatheusAnsel/brasil-econ-dashboard/compare/v0.2.0...v1.0.0
[0.2.0]: https://github.com/MatheusAnsel/brasil-econ-dashboard/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/MatheusAnsel/brasil-econ-dashboard/releases/tag/v0.1.0
