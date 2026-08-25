import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Cross-package imports resolve to core's source during a test run.
  //
  // Without this, `tsp-asyncapi-core` resolves through the workspace symlink,
  // so v8 records a path with `node_modules` in it and the coverage include
  // never matches. Measured: `resolve/` reported 12.5% of statements while
  // every one of its callers passed.
  //
  // The alias does not change what the tests check. It changes which copy of
  // core executes, from the built output to the source the coverage report is
  // about. The decorators are the exception, and they always were: the compiler
  // loads those from `dist` through `lib/main.tsp`, which is why the build
  // output is still collected below.
  resolve: {
    alias: {
      "tsp-asyncapi-core/unstable": fileURLToPath(
        new URL("./packages/tsp-asyncapi-core/src/unstable.ts", import.meta.url),
      ),
      "tsp-asyncapi-core/types": fileURLToPath(
        new URL("./packages/tsp-asyncapi-core/src/types/index.ts", import.meta.url),
      ),
      "tsp-asyncapi-core": fileURLToPath(
        new URL("./packages/tsp-asyncapi-core/src/index.ts", import.meta.url),
      ),
    },
  },
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
    // Test files share one module registry per worker instead of getting a
    // fresh one each. Measured on the full suite with coverage: 27.31s to
    // 13.02s, because `setup` falls from 74.03s of worker time to 4.68s and
    // `import` from 46.17s to 13.76s. Over half of all worker time was
    // re-importing the same modules 114 times.
    //
    // This is safe here for a reason the architecture already required, not by
    // luck. Sharing a registry only leaks when a module holds mutable state at
    // its top level, and neither `src/` nor `test/` has any: no module-level
    // `let`, no module-level `Map` or `Set`. That is the same rule that lets
    // the pipeline be resolved and lowered more than once in one process, and
    // it is why the binding consumption marks were moved off the program into
    // a collector the build passes explicitly.
    //
    // File-level parallelism is unaffected and was never the bottleneck: CI
    // already ran at 2.74 of the 3 workers a four-vCPU runner allows.
    //
    // Introduce a module-level mutable value and this has to go back to true.
    // The symptom will be a test that passes alone and fails in the suite, or
    // one whose result depends on which file ran before it.
    isolate: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov"],
      include: ["packages/*/src/**/*.ts", "packages/*/dist/src/decorators/**/*.js"],
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
      //
      // Both patterns are a `packages/*` glob rather than one package name.
      // A package added later carries decorators the compiler loads from its
      // own `dist`, and a named pattern would collect that package from the
      // copy whose bodies never run there.
      exclude: [
        "packages/*/src/decorators/**/*.ts",
        "packages/*/src/index.ts",
        "packages/*/src/testing.ts",
        "test/**",
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
      //
      // Measured on 2026-08-23, and the loss is larger than the paragraph
      // above assumed. A probe was appended to three functions in
      // `dist/src/decorators/bindings/pulsar/config.js`, each writing a line
      // to a file. A probe writes to a file rather than the console because
      // vitest captures console output from a decorator body. Running
      // `test/unit/package-asyncapi/bindings/pulsar.test.ts` with coverage on:
      //
      //   compaction       ran 6 times,  reported 0
      //   geoReplication   ran 6 times,  reported 0
      //   persistence      ran 10 times, reported 1
      //
      // So the count is wrong for a function that is driven, not only for one
      // the report zeroes. Four causes were ruled out by experiment. It is not
      // the source map: stripping the `sourceMappingURL` and collecting the
      // `dist` JavaScript directly gives the same zeros. It is not `isolate`,
      // which was tried both ways. It is not `experimentalAstAwareRemapping`,
      // tried both ways. And it is not a second module instance: the probe
      // printed `import.meta.url`, and one path appeared.
      //
      // What this means for a target. Split by half, statements were 97.15%
      // outside `decorators/` and 70.60% inside it on 2026-08-23. The whole
      // gap sits in the half whose measurement is broken, so a target above
      // about 88% cannot be reached by adding tests. Fix the attribution
      // before setting one.
      //
      // Re-measured on 2026-08-25, after the two decorator patterns became a
      // `packages/*` glob and picked `tsp-avro` up: statements 87.99,
      // branches 80.64, functions 87.05, lines 88.99. The floors below stay
      // where they are, because they are floors.
      thresholds: {
        statements: 85,
        branches: 78,
        functions: 84,
        lines: 86,
      },
    },
  },
});
