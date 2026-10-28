// dSerie: dimensão com as séries disponíveis na API (uma linha por série).
// Depende do parâmetro ApiBase (texto), por exemplo https://brasil-econ-api.onrender.com
// A API fica em plano gratuito e dorme sem uso: o timeout de 2 minutos cobre o primeiro acesso.
let
    Fonte = Json.Document(
        Web.Contents(ApiBase, [RelativePath = "series", Timeout = #duration(0, 0, 2, 0)])
    ),
    Tabela = Table.FromRecords(Fonte),
    Tipos = Table.TransformColumnTypes(
        Tabela,
        {
            {"id", Int64.Type},
            {"source", type text},
            {"code", type text},
            {"name", type text},
            {"unit", type text},
            {"periodicity", type text}
        }
    ),
    Renomeado = Table.RenameColumns(
        Tipos,
        {
            {"id", "SerieId"},
            {"source", "Fonte"},
            {"code", "Codigo"},
            {"name", "Serie"},
            {"unit", "Unidade"},
            {"periodicity", "Periodicidade"}
        }
    )
in
    Renomeado
