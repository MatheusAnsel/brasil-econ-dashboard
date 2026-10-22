# 0003. ETL agendado dentro da própria API, sem cron externo

**Status:** aceita

## Contexto
A API roda no plano gratuito do Render, que não inclui cron job e hiberna o serviço depois de cerca de 15 minutos sem acesso. Um `setInterval` com horário fixo não resolve, porque o processo pode estar dormindo no horário marcado. Os dados do Banco Central são diários, então ficar algumas horas atrasado não é problema, mas ficar dias sem atualizar é.

## Decisão
- Com `ETL_AUTO=true`, a API inicia um agendador ao subir (`apps/api/src/etl-scheduler.ts`).
- Ele verifica a idade dos dados ao subir e a cada hora. Se o último ETL com sucesso tem mais de 24 horas (ou nunca houve um), roda o ETL.
- Uma flag impede duas execuções ao mesmo tempo, e qualquer erro do ETL é registrado sem derrubar a API.
- O ETL continua disponível como processo separado (`npm run etl`), para rodar à mão ou em um cron de verdade se a hospedagem mudar.

## Consequências
- Os dados se atualizam sem serviço pago: a verificação acontece assim que a API acorda com a primeira visita do dia.
- A primeira visita depois de um período parado pode disparar o ETL enquanto a API responde. As leituras continuam funcionando, porque a escrita é upsert (ADR 0001).
- A trava de execução é por processo. Com mais de uma instância da API, cada uma poderia rodar o seu ETL. O resultado continua correto por causa do upsert, mas o trabalho seria duplicado. Nesse cenário, o certo seria voltar ao cron externo ou usar um lock no banco.
- Os testes cobrem o agendador com o ETL e o relógio injetados, sem rede e sem esperar o intervalo real.
