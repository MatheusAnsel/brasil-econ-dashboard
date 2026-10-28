// fObservacoes: tabela fato no formato longo (SerieId, Data, Valor), uma linha por série e mês.
// Tudo numa consulta só: lista as séries e busca as médias mensais de cada uma.
// Referenciar outra consulta (dSerie ou uma função separada) aqui dispara o erro
// Formula.Firewall do Power BI, que bloqueia combinar consultas que acessam a web.
let
    Buscar = (caminho as text, consulta as record) =>
        Json.Document(
            Web.Contents(ApiBase, [RelativePath = caminho, Query = consulta, Timeout = #duration(0, 0, 2, 0)])
        ),
    Series = Table.FromRecords(Buscar("series", []), {"id"}, MissingField.UseNull),
    ComDados = Table.AddColumn(
        Series,
        "Dados",
        each Table.FromRecords(
            Buscar("series/" & Number.ToText([id]) & "/observations", [agg = "month"])[data],
            {"date", "value"},
            MissingField.UseNull
        ),
        type table
    ),
    Expandido = Table.ExpandTableColumn(ComDados, "Dados", {"date", "value"}, {"Data", "Valor"}),
    Renomeado = Table.RenameColumns(Expandido, {{"id", "SerieId"}}),
    // As datas vêm em ISO (yyyy-mm-dd); a cultura en-US evita erro de conversão em Windows em português
    Tipos = Table.TransformColumnTypes(
        Renomeado,
        {{"SerieId", Int64.Type}, {"Data", type date}, {"Valor", type number}},
        "en-US"
    ),
    // Tratamento: descarta pontos sem data ou sem valor e garante uma linha por série e mês
    SemVazios = Table.SelectRows(Tipos, each [Data] <> null and [Valor] <> null),
    SemDuplicados = Table.Distinct(SemVazios, {"SerieId", "Data"})
in
    SemDuplicados
