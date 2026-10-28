// fnObservacoes: função que busca as médias mensais de uma série pela API.
// Uso: fnObservacoes(1) devolve uma tabela com as colunas date e value.
// RelativePath e Query (em vez de concatenar a URL) permitem a atualização agendada no Power BI Service.
(serieId as number) as table =>
let
    Resposta = Json.Document(
        Web.Contents(
            ApiBase,
            [
                RelativePath = "series/" & Number.ToText(serieId) & "/observations",
                Query = [agg = "month"],
                Timeout = #duration(0, 0, 2, 0)
            ]
        )
    ),
    Pontos = Resposta[data],
    Tabela = Table.FromRecords(Pontos, {"date", "value"}, MissingField.UseNull)
in
    Tabela
