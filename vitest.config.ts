import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // A git worktree created under `.claude/worktrees/` is a full second
    // checkout of this repository, tests included. Without this exclusion
    // vitest collects those copies too, then runs them against this
    // checkout's `dist/`, which fails in bulk and hides the real result.
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**"],
    // Registers the AsyncAPI matchers before any test file runs.
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/types/**", "test/**", "src/testing/**/*.ts"],
      // A floor, not a target. Each number sits a few points under what the
      // suite reaches today, so ordinary movement does not fail the run and
      // a real drop does. Raise them when the suite settles higher.
      // Measured at the time of writing: statements 89.55, branches 83.14,
      // functions 93.75, lines 91.42.
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 90,
        lines: 88,
      },
    },
  },
});
