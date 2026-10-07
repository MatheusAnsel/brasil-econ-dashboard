import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import SwaggerParser from "@apidevtools/swagger-parser";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app";
import { testDb } from "../../../test/helpers";

const { db, pool } = testDb();
let app: FastifyInstance;

beforeAll(async () => {
  const instancia = await buildApp(db, { logger: false });
  app = instancia;
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("documentação OpenAPI gerada a partir das rotas", () => {
  it("é um documento OpenAPI 3 válido", async () => {
    const spec = JSON.parse(JSON.stringify(app.swagger()));
    await expect(SwaggerParser.validate(spec)).resolves.toBeTruthy();
    expect(spec.info.title).toBe("Brasil Econ API");
  });

  it("documenta todas as rotas de negócio", () => {
    const spec = app.swagger() as { paths: Record<string, Record<string, unknown>> };
    const documentadas = Object.entries(spec.paths).flatMap(([caminho, ops]) =>
      Object.keys(ops).map((m) => `${m.toUpperCase()} ${caminho}`),
    );

    expect(documentadas.sort()).toEqual(
      [
        "GET /health",
        "GET /ready",
        "GET /series/",
        "GET /series/{id}/observations",
        "GET /analytics/correlation",
        "GET /analytics/real-rate",
        "GET /etl/status",
      ].sort(),
    );
  });

  it("os parâmetros documentados vêm dos mesmos schemas Zod que validam (sem divergência)", () => {
    const spec = app.swagger() as any;
    const params = spec.paths["/analytics/correlation"].get.parameters.map((p: any) => p.name).sort();
    expect(params).toEqual(["a", "b", "lag"]);

    const obs = spec.paths["/series/{id}/observations"].get.parameters.map((p: any) => `${p.in}:${p.name}`).sort();
    expect(obs).toEqual(["path:id", "query:agg", "query:from", "query:to"]);

    const agg = spec.paths["/series/{id}/observations"].get.parameters.find((p: any) => p.name === "agg");
    expect(agg.schema.enum).toEqual(["none", "month", "year"]);
  });

  it("serve o spec em /docs/json e a interface em /docs", async () => {
    const json = await app.inject({ method: "GET", url: "/docs/json" });
    const ui = await app.inject({ method: "GET", url: "/docs" });

    expect(json.statusCode).toBe(200);
    expect(json.json().openapi).toMatch(/^3\./);
    expect(ui.statusCode).toBe(200);
    expect(ui.headers["content-type"]).toContain("text/html");
  });

  it("a página do Swagger UI só executa scripts permitidos pelo CSP (arquivo próprio ou hash)", async () => {
    const ui = await app.inject({ method: "GET", url: "/docs" });
    const csp = String(ui.headers["content-security-policy"] ?? "");
    const scripts = [...ui.body.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];

    expect(csp).toContain("script-src");
    for (const [, atributos, conteudo] of scripts) {
      if (/\bsrc=/.test(atributos)) continue;
      const hash = `'sha256-${createHash("sha256").update(conteudo).digest("base64")}'`;
      expect(csp, `script inline sem hash no CSP: ${conteudo.slice(0, 60)}`).toContain(hash);
    }
  });
});
