/**
 * This library's definition, as the TypeSpec compiler sees it.
 *
 * The name registered here becomes the prefix of every diagnostic code this
 * library reports. It matches the package name, so a user who reads
 * `tsp-avro/<code>` knows which package to look at. This library declares no
 * diagnostic yet.
 *
 * The compiler validates the `tspconfig.yaml` options of an emitter against
 * the `emitter.options` schema registered here. The schema accepts no option
 * today, and `additionalProperties: false` makes the compiler reject any
 * option a project writes. The output directory is not an option: the
 * compiler supplies `emitter-output-dir` for every emitter, and
 * `context.emitterOutputDir` is how this emitter reads it.
 */

import { createTypeSpecLibrary, type JSONSchemaType } from "@typespec/compiler";

/**
 * Configuration options for the Avro emitter.
 *
 * The emitter takes no option of its own. Set the output directory with the
 * compiler option `emitter-output-dir`.
 *
 * @public
 */
export type AvroEmitterOptions = Record<string, never>;

/**
 * The schema the compiler validates the emitter options against.
 */
const EmitterOptionsSchema: JSONSchemaType<AvroEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {},
  required: [],
};

/**
 * The TypeSpec library definition for this emitter.
 *
 * @public
 */
export const $lib = createTypeSpecLibrary({
  name: "tsp-avro",
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
export const PACKAGE_NAME = "tsp-avro";
