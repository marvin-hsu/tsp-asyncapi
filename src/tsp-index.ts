import {
  $externalDocs,
  $info,
  $jsonSchemaExtension,
  $message,
  $oneOf,
  $server,
} from "./decorators/index.js";

export { $lib } from "./lib.js";

/**
 * The decorator implementations, for the compiler rather than for a
 * consumer of this package.
 *
 * `lib/main.tsp` imports this file, which is how the compiler binds each
 * `extern dec` to the function that runs it. Keeping the binding here, and
 * out of `src/index.ts`, means the published API is a decision rather than
 * a side effect of which file happens to export what.
 *
 * @internal
 */
export const $decorators = {
  AsyncAPI: {
    info: $info,
    server: $server,
    externalDocs: $externalDocs,
    oneOf: $oneOf,
    jsonSchemaExtension: $jsonSchemaExtension,
    message: $message,
  },
};
