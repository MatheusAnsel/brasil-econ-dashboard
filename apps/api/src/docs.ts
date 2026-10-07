import { z } from "zod";

/** Converte um schema Zod em JSON Schema para a documentação OpenAPI (sem a chave $schema). */
export function toSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { io: "input", target: "draft-7" }) as Record<
    string,
    unknown
  >;
  return rest;
}

const erro = {
  type: "object",
  properties: {
    error: { type: "string" },
    details: { type: "array", items: { type: "object" } },
  },
} as const;

export const responses = {
  erro,
  invalido: { description: "Parâmetros inválidos", ...erro },
  naoEncontrado: { description: "Recurso não encontrado", ...erro },
  limite: { description: "Limite de requisições excedido", ...erro },
};

export const serieItem = {
  type: "object",
  properties: {
    id: { type: "integer" },
    source: { type: "string", examples: ["bcb"] },
    code: { type: "string", examples: ["432"] },
    name: { type: "string", examples: ["Meta Selic"] },
    unit: { type: "string", examples: ["% a.a."] },
    periodicity: { type: "string", enum: ["daily", "monthly", "quarterly"] },
  },
} as const;

export const pontoItem = {
  type: "object",
  properties: { date: { type: "string", format: "date" }, value: { type: "number" } },
} as const;

export const etlRunItem = {
  type: ["object", "null"],
  properties: {
    id: { type: "integer" },
    source: { type: "string" },
    startedAt: { type: "string", format: "date-time" },
    finishedAt: { type: ["string", "null"], format: "date-time" },
    status: { type: "string", enum: ["running", "success", "error"] },
    rowsUpserted: { type: "integer" },
    error: { type: ["string", "null"] },
  },
} as const;
