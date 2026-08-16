import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Two directories hold copies of other checkouts, and vitest would run
    // their tests against this one's `dist/`. That fails in bulk and buries
    // the real result. `.claude/worktrees/` holds worktrees of this
    // repository. `plan/` is git-ignored and holds reference copies of other
    // people's emitters, which is why `git status` never showed them.
    // `plan/` is matched at any depth, not just at the root. `.gemini` is a
    // symlink to `.claude`, and `.claude/worktrees/` holds worktrees of this
    // same repository. Each worktree links `plan` back here. So the competitor
    // sources under `plan/otherproject/` are reachable as
    // `.gemini/worktrees/<name>/plan/otherproject/`, which a root-anchored
    // `plan/**` does not match. That path made this suite collect 232 MB of
    // other people's tests.
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**", ".gemini/**", "**/plan/**"],
    // Registers the AsyncAPI matchers before any test file runs.
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov"],
      include: ["src/**/*.ts", "dist/src/**/*.js"],
      // Both the sources and the build output are collected, and the
      // report maps back to the sources through the source maps that
      // `tsconfig.build.json` now emits. That is the only way the decorators
      // are counted at all: `lib/main.tsp` imports `../dist/src/tsp-index.js`,
      // so the compiler runs them from the build output while the tests drive
      // them. Collecting the sources alone reported `server.ts` at 10%, with
      // twenty tests exercising it.
      exclude: ["src/index.ts", "src/types/**", "test/**", "src/testing/**/*.ts"],
      // A floor, not a target. Each number sits several points under what
      // the suite reaches, because a refactor moves coverage in both
      // directions at once: deleting well-tested code takes away covered
      // lines while new branches arrive uncovered. Thresholds set just under
      // the current value turn every such change into a failure that says
      // nothing about quality. New code is held to a higher bar by the
      // SonarCloud gate, which is where growth belongs.
      // Measured once the decorators became visible: statements 96.55,
      // branches 89.11, functions 88.42, lines 97.38.
      thresholds: {
        statements: 92,
        branches: 84,
        functions: 83,
        lines: 92,
      },
    },
  },
});
