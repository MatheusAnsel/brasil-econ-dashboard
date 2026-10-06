import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Carrega o .env da raiz do monorepo, independente de onde o processo foi iniciado.
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}
