/**
 * The entry point the TypeSpec compiler loads to find decorator
 * implementations.
 *
 * `lib/main.tsp` imports the built copy of this file. So the compiler runs the
 * build output, not the source. Build the package before you compile anything
 * that uses a decorator from it.
 */

import { $namespace, $record } from "./decorators/index.js";

export { $lib } from "./lib.js";

/**
 * The decorator implementations, for the compiler rather than for a consumer
 * of this package.
 *
 * `lib/main.tsp` imports this file, which is how the compiler binds each
 * `extern dec` to the function that runs it. Keeping the binding here, and out
 * of `src/index.ts`, means the published API is a decision rather than a side
 * effect of which file happens to export what.
 *
 * @internal
 */
export const $decorators = {
  Avro: {
    namespace: $namespace,
    record: $record,
  },
};
