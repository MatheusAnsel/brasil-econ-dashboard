// fCorrelacao: correlação entre a Selic e o IPCA 12 meses à frente, de 0 a 24 meses.
// Faz uma chamada por defasagem a GET /analytics/correlation (25 chamadas, dentro do limite da API).
let
    Defasagens = List.Numbers(0, 25),
    Respostas = List.Transform(
        Defasagens,
        each Json.Document(
            Web.Contents(
                ApiBase,
                [
                    RelativePath = "analytics/correlation",
                    Query = [a = "432", b = "13522", lag = Number.ToText(_)],
                    Timeout = #duration(0, 0, 2, 0)
                ]
            )
        )
    ),
    Tabela = Table.FromRecords(Respostas, {"lag", "n", "correlation"}, MissingField.UseNull),
    Renomeado = Table.RenameColumns(
        Tabela,
        {{"lag", "Defasagem (meses)"}, {"n", "Pares de meses"}, {"correlation", "Correlação"}}
    ),
    Tipos = Table.TransformColumnTypes(
        Renomeado,
        {{"Defasagem (meses)", Int64.Type}, {"Pares de meses", Int64.Type}, {"Correlação", type number}}
    )
in
    Tipos
