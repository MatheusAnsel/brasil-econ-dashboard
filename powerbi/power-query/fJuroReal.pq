// fJuroReal: juro real mensal calculado pela API (GET /analytics/real-rate).
// Serve para conferência: a medida DAX [Juro Real (Fisher)] precisa dar o mesmo número.
let
    Resposta = Json.Document(
        Web.Contents(ApiBase, [RelativePath = "analytics/real-rate", Timeout = #duration(0, 0, 2, 0)])
    ),
    Tabela = Table.FromRecords(Resposta[data], {"date", "selic", "ipca12m", "realRate"}, MissingField.UseNull),
    Renomeado = Table.RenameColumns(
        Tabela,
        {{"date", "Data"}, {"selic", "Selic"}, {"ipca12m", "IPCA 12m"}, {"realRate", "Juro Real API"}}
    ),
    Tipos = Table.TransformColumnTypes(
        Renomeado,
        {{"Data", type date}, {"Selic", type number}, {"IPCA 12m", type number}, {"Juro Real API", type number}},
        "en-US"
    )
in
    Tipos
