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
    // The default is 5 seconds, and the slowest property runs 3.4 of them on
    // a warm machine: seven property files compile TypeSpec inside `fc.assert`,
    // so one test is hundreds of compilations. That leaves too little room for
    // a cold CI runner.
    //
    // Twenty seconds is about six times the slowest measurement, which is room
    // for a slower machine without being a ceiling that hides a real
    // regression. Eleven per-test ceilings of two and three minutes used to
    // carry this, and a test that started taking a minute would have passed
    // under every one of them.
    //
    // Lower this when a property stops compiling TypeSpec, not when it gets
    // faster.
    testTimeout: 20000,
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
      // A floor, not a target, and set two points under the measurement of
      // 2026-08-17: statements 87.63, branches 80.04, functions 86.11,
      // lines 88.44.
      //
      // Branches cannot reach 100 here. v8-to-istanbul emits a second, empty
      // location for every `if` that has no `else`, and that slot is never
      // taken by anything. Read the branch number against about 92, not
      // against 100, before deciding a gap is worth chasing.
      //
      // Raise a floor as coverage grows. Never lower one to make a change
      // fit. This one was lowered once, on 2026-08-17, and the reason is not
      // that the tests got worse.
      //
      // The number under-reports the decorators, and by a widening margin as
      // more of them are added. `lib/main.tsp` imports `../dist/src/tsp-index.js`,
      // so a decorator body runs from the build output, and v8 loses hits when
      // it maps those bodies back onto their source paths. The proof is
      // `listBindings` in `src/decorators/bindings/state.ts`: it is reported as
      // executed zero times, while `src/resolve/bindings.ts` calls it for every
      // target and no binding would reach any document without it. The same
      // shows on `claimBinding`, which every binding test drives.
      //
      // Adding eleven protocols added about twenty decorator modules, and the
      // measurement fell about three points while the suite grew by 116 tests,
      // every one of them driving the new code. Three fixes were tried and
      // none recovered the attribution: `excludeAfterRemap: true` drops the
      // decorator entries altogether, `inlineSources` changes nothing, and the
      // istanbul provider is worse, because it instruments the `src` copies
      // that never run.
      //
      // So read a fall here as a question, not a verdict. Check whether the
      // new code is driven by tests before believing this number over them.
      thresholds: {
        statements: 85,
        branches: 78,
        functions: 84,
        lines: 86,
      },
    },
  },
});
