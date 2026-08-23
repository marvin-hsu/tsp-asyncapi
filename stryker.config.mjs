/**
 * Mutation testing.
 *
 * Stryker changes the source on purpose, then reruns the suite. A mutant
 * that survives is a change no test noticed, which marks a gap the coverage
 * number cannot show: a line can be covered by a test that would pass
 * whatever it did.
 *
 * This is deliberately not wired into CI. A full run reruns the suite once
 * per mutant, so it costs minutes rather than seconds. Run it by hand when
 * you want to judge the strength of the tests, not on every push.
 */
export default {
  packageManager: "pnpm",
  testRunner: "vitest",
  // pnpm keeps each package in its own store directory, so Stryker does not
  // find its plugins by scanning its own `node_modules`. Naming the plugin
  // makes it resolve from the project root instead.
  plugins: ["@stryker-mutator/vitest-runner"],
  reporters: ["html", "clear-text", "progress"],

  // Only the emitter's own logic is worth mutating. `types` holds interfaces
  // that carry no runtime behaviour, `index` only re-exports, and `testing`
  // is a helper for consumers rather than emitter logic. Mutating those
  // produces survivors that mean nothing.
  mutate: [
    "packages/*/src/**/*.ts",
    "!packages/*/src/index.ts",
    "!packages/*/src/testing/**",
    "!packages/*/src/lib.ts",
    "!packages/*/src/types/**",
  ],

  // The suite builds first through `pretest`, and Stryker runs vitest
  // directly, so the build has to happen before the run instead.
  // The whole workspace, in dependency order. Mutating core's source and
  // testing against a stale `dist` measures nothing: the compiler loads the
  // decorators from the build output.
  buildCommand: "pnpm build",

  // A mutant that makes the emitter loop forever is stopped rather than
  // hanging the run. The base is measured from a clean run.
  timeoutMS: 10000,

  // A first run sets the baseline. Raise the threshold as the suite improves.
  thresholds: { high: 80, low: 60, break: null },
};
