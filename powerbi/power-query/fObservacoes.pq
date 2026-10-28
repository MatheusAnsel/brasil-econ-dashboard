// fObservacoes: tabela fato no formato longo (SerieId, Data, Valor), uma linha por série e mês.
// Formato longo + dimensão de séries = modelo estrela: um gráfico serve para qualquer série.
let
    Series = Table.SelectColumns(dSerie, {"SerieId"}),
    ComDados = Table.AddColumn(Series, "Dados", each fnObservacoes([SerieId]), type table),
    Expandido = Table.ExpandTableColumn(ComDados, "Dados", {"date", "value"}, {"Data", "Valor"}),
    // As datas vêm em ISO (yyyy-mm-dd); a cultura en-US evita erro de conversão em Windows em português
    Tipos = Table.TransformColumnTypes(
        Expandido,
        {{"Data", type date}, {"Valor", type number}},
        "en-US"
    ),
    // Tratamento: descarta pontos sem data ou sem valor e garante uma linha por série e mês
    SemVazios = Table.SelectRows(Tipos, each [Data] <> null and [Valor] <> null),
    SemDuplicados = Table.Distinct(SemVazios, {"SerieId", "Data"})
in
    SemDuplicados
