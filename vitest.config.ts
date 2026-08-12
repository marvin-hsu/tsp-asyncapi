import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/types/**", "test/**", "src/testing/**/*.ts"],
    },
  },
});
