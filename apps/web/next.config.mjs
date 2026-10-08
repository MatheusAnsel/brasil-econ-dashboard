import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gera .next/standalone com só o necessário para rodar, usado pela imagem Docker.
  // A raiz do monorepo entra no rastreamento porque as dependências ficam no node_modules da raiz.
  output: "standalone",
  outputFileTracingRoot: raiz,
};
export default nextConfig;
