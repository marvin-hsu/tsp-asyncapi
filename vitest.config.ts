import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Two directories hold copies of other checkouts, and vitest would run
    // their tests against this one's `dist/`. That fails in bulk and buries
    // the real result. `.claude/worktrees/` holds worktrees of this
    // repository. `plan/` is git-ignored and holds reference copies of other
    // people's emitters, which is why `git status` never showed them.
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**", "plan/**"],
    // Registers the AsyncAPI matchers before any test file runs.
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov"],
      include: ["src/**/*.ts"],
      // `src/decorators` is left out because it cannot be measured here.
      // `lib/main.tsp` imports `../dist/src/tsp-index.js`, so the compiler
      // runs the decorators from the build output while v8 instruments the
      // sources. The sources then read as unrun even though the tests drive
      // them hard: `content-type.ts` reports its duplicate and empty-value
      // branches as uncovered, and three tests in `test/unit/messages.test.ts`
      // assert the diagnostics those very branches report. Counting them
      // would hold the threshold against a number that measures the wrong
      // copy.
      exclude: [
        "src/index.ts",
        "src/types/**",
        "test/**",
        "src/testing/**/*.ts",
        "src/decorators/**",
      ],
      // A floor, not a target. Each number sits several points under what
      // the suite reaches, because a refactor moves coverage in both
      // directions at once: deleting well-tested code takes away covered
      // lines while new branches arrive uncovered. Thresholds set just under
      // the current value turn every such change into a failure that says
      // nothing about quality. New code is held to a higher bar by the
      // SonarCloud gate, which is where growth belongs.
      // Measured at the time of writing: statements 97.31, branches 91.65,
      // functions 100, lines 97.88.
      thresholds: {
        statements: 92,
        branches: 86,
        functions: 95,
        lines: 92,
      },
    },
  },
});
