import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Na Vercel (variável VERCEL=1) o front é exportado como site estático, pois toda a busca de dados
  // acontece no navegador. Fora dela, gera .next/standalone com só o necessário para rodar, usado
  // pela imagem Docker. A raiz do monorepo entra no rastreamento porque as dependências ficam
  // no node_modules da raiz.
  output: process.env.VERCEL ? "export" : "standalone",
  outputFileTracingRoot: raiz,
};
export default nextConfig;
