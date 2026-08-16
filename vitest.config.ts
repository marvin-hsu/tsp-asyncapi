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
      include: ["src/**/*.ts", "dist/src/decorators/**/*.js"],
      // The sources, plus the build output of the decorators only.
      //
      // A decorator module is live twice at run time. `lib/main.tsp` imports
      // `../dist/src/tsp-index.js`, so the compiler runs decorator bodies from
      // the build output, while a test that imports a builder loads the `src`
      // copy of the same file. Collecting `dist/src/**` wholesale gave every
      // builder a second entry on the same source path, and the two coverage
      // maps are concatenated rather than merged: 225 functions were listed
      // twice, 40 of them with a zero twin. That inflated both halves of the
      // ratio and made added tests look like they changed nothing.
      //
      // So each file is collected from exactly one place. Decorators come from
      // `dist`, because that is where their bodies run, and `src/decorators/**`
      // is excluded below to keep the pair from returning. Everything else
      // comes from `src`.
      exclude: [
        "src/decorators/**/*.ts",
        "src/index.ts",
        "src/types.ts",
        "test/**",
        "src/testing/**/*.ts",
      ],
      // A floor, not a target, and set against the honest measurement taken
      // on 2026-08-16 after the duplicate entries were removed: statements
      // 91.03, branches 83.82, functions 87.34, lines 91.87.
      //
      // Branches cannot reach 100 here. v8-to-istanbul emits a second, empty
      // location for every `if` that has no `else`, and that slot is never
      // taken by anything. 94 of the 1212 branch slots are these phantoms, so
      // the real ceiling is about 92 percent. Read 83.82 against 92, not
      // against 100, before deciding a gap is worth chasing.
      //
      // Raise a floor as coverage grows. Never lower one to make a change fit.
      thresholds: {
        statements: 89,
        branches: 82,
        functions: 85,
        lines: 90,
      },
    },
  },
});
