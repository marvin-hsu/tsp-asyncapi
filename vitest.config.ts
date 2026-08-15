import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // A git worktree created under `.claude/worktrees/` is a full second
    // checkout of this repository, tests included. Without this exclusion
    // vitest collects those copies too, then runs them against this
    // checkout's `dist/`, which fails in bulk and hides the real result.
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/types/**", "test/**", "src/testing/**/*.ts"],
    },
  },
});
