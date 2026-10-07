import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    // Os testes de integração compartilham um único banco: rodam um arquivo por vez.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["apps/api/src/**/*.ts", "apps/etl/src/**/*.ts"],
      // server.ts e run.ts são só a "cola" que liga as peças testadas ao processo e à rede.
      exclude: ["**/*.test.ts", "apps/api/src/server.ts", "apps/etl/src/run.ts"],
      reporter: ["text", "text-summary", "lcov"],
      // Piso exigido no CI: a build falha se a cobertura cair abaixo disto.
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 90 },
    },
  },
});
