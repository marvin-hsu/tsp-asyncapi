/**
 * This emitter's library definition.
 *
 * The compiler validates `tspconfig.yaml` options against the
 * `emitter.options` schema of the emitter package's own library, so the
 * schema has to be registered from here.
 *
 * It declares no diagnostics. Every diagnostic lives in `tsp-asyncapi-core`,
 * so a reader finds every code in one place; code here calls the
 * `reportDiagnostic` that core exports.
 *
 * The name matches core's on purpose: both are `tsp-asyncapi`, the prefix
 * every diagnostic code carries. Two libraries can share one name, which
 * keeps the codes stable across the package split.
 */

import { createTypeSpecLibrary } from "@typespec/compiler";
import { EmitterOptionsSchema } from "./emitter-options.js";

/**
 * The TypeSpec library definition for this emitter.
 *
 * @public
 */
export const $lib = createTypeSpecLibrary({
  name: "tsp-asyncapi",
  diagnostics: {},
  emitter: {
    options: EmitterOptionsSchema,
  },
});

/**
 * This package's name, as declared in `package.json`.
 *
 * It is also the name a project writes in `tspconfig.yaml`, both under `emit:`
 * and as the key of its options.
 *
 * @public
 */
export const PACKAGE_NAME = "tsp-asyncapi";
