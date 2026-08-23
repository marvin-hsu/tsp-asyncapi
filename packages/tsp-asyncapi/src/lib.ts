/**
 * This emitter's library definition.
 *
 * It exists for one reason: the compiler validates `tspconfig.yaml` options
 * against the `emitter.options` schema of the emitter package's own library.
 * So the schema has to be registered from here.
 *
 * It declares no diagnostics. All 103 of them live in `tsp-asyncapi-core`,
 * including the eighteen this package reports, because a reader looking up a
 * code should find every code in one place. Code here calls the
 * `reportDiagnostic` that core exports.
 *
 * The name matches core's on purpose. Both are `tsp-asyncapi`, which is the
 * prefix every diagnostic code carries. Two libraries under one name is
 * supported, and it keeps the codes stable across the package split.
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
