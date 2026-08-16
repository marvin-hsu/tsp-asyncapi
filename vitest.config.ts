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
      //
      // The source copy of every decorator module is left out again, and
      // only the build output of those modules is counted. The builders
      // import the decorator modules from `src`, so the source copy is
      // loaded. Its decorator functions never run, because the compiler
      // calls the build output instead. The source copy therefore reports
      // an all-zero branch set for those functions. The two copies map onto
      // one source path, and the merge does not combine their branch maps.
      // The zeros survive in the denominator and are counted a second time.
      // Measured: without this line branches read 84.59% (1131/1337), and
      // with it they read 87.37% (1066/1220). No test changed between the
      // two runs. The cost is that a decorator reader function called from
      // `src` alone, such as `getServers`, is no longer counted, which is
      // why lines and functions each fall about three points.
      exclude: [
        "src/decorators/**/*.ts",
        "src/index.ts",
        "src/types/**",
        "test/**",
        "src/testing/**/*.ts",
      ],
      // A floor, not a target. Each number sits several points under what
      // the suite reaches, because a refactor moves coverage in both
      // directions at once: deleting well-tested code takes away covered
      // lines while new branches arrive uncovered. Thresholds set just under
      // the current value turn every such change into a failure that says
      // nothing about quality. New code is held to a higher bar by the
      // SonarCloud gate, which is where growth belongs.
      //
      // Measured on 2026-08-16, over 603 tests: statements 94.23, branches
      // 87.37, functions 85.44, lines 93.63.
      //
      // The branch floor was 83 for one phase. That phase landed with weaker
      // branch coverage than the rest of this codebase, and the floor was
      // lowered to let it land. That reason no longer holds. Two things
      // closed the gap. The double counting described above left the report,
      // and the server tests now cover the branches the phase left open.
      // Branches read 87.37, so the floor moves to 85.
      //
      // Do not lower any of these again to make a change fit. Raise the
      // floor instead, once a measured run stays several points above it.
      // Measured with Phase 5 merged, 2026-08-16: statements 93.53,
      // branches 87.10, functions 84.41, lines 92.93. `lines` and
      // `functions` each sit about three points lower than before this
      // file stopped collecting `src/decorators/**`. That is a change of
      // measurement, not lost testing: a decorator module loads twice at
      // run time, from `src` when a test imports a builder and from
      // `dist` when the compiler runs it, and only the `dist` copy ever
      // executes a decorator body. The readers that run only from `src`
      // stopped being counted, and that is where the points went.
      // Raise a floor as coverage grows; never lower one to fit a change.
      //
      // Measured on 2026-08-16, after the bindings phase and the
      // coverage-debt pass. Before that pass, over 735 tests: statements
      // 93.13, branches 85.69, functions 85.05, lines 92.34. After it, over
      // 747 tests: statements 93.17, branches 86.91, functions 85.05, lines
      // 92.40.
      //
      // The pass targeted branches alone, and branches carried the gain:
      // 85.69 to 86.91, which is 17 more covered branches. Each of the
      // twelve new tests was checked by mutation. The rule it covers was
      // broken in the source, and the test had to turn red before it was
      // kept.
      //
      // Only `functions` moves, from 83 to 84. Function coverage reads
      // 85.05, so 84 still leaves about a point of headroom. The bindings
      // phase earned that point, not this pass. The other three floors stay
      // where they are. Each already sits one to two points under its
      // measured value, which is the intended margin. Raising them further
      // would leave no room for an ordinary refactor. Branches read 86.91
      // against a floor of 85, and that margin is deliberate: the branch
      // count is the number a refactor moves most.
      thresholds: {
        statements: 92,
        branches: 85,
        functions: 84,
        lines: 91,
      },
    },
  },
});
