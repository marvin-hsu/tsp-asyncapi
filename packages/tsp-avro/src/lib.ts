/**
 * This library's definition, as the TypeSpec compiler sees it.
 *
 * The name registered here becomes the prefix of every diagnostic code this
 * library reports. It matches the package name, so a user who reads
 * `tsp-avro/<code>` knows which package to look at.
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
 * Every diagnostic here is an error, and an error stops the whole emit. A
 * schema this package cannot express is refused, never guessed: a half
 * translated record reaches a schema registry as a valid schema that means
 * something the author did not write.
 *
 * @public
 */
export const $lib = createTypeSpecLibrary({
  name: "tsp-avro",
  diagnostics: {
    "namespace-required": {
      severity: "error",
      messages: {
        default:
          "A record needs an Avro namespace. Apply @namespace to this model's namespace, or to one above it.",
      },
    },
    "invalid-name": {
      severity: "error",
      messages: {
        default: `"{name}" is not a legal Avro name. A name starts with a letter or an underscore, and continues with letters, digits or underscores.`,
        namespace: `"{name}" is not a legal Avro namespace. A namespace is one or more legal Avro names, joined by dots.`,
      },
    },
    "unsupported-type": {
      severity: "error",
      messages: {
        default: `A property of kind "{kind}" has no Avro form.`,
        anonymous: "An anonymous model has no name, and an Avro record needs one.",
        scalar: `The scalar "{name}" has no Avro form.`,
        union: "A union is not supported yet.",
        inheritance: `The model "{name}" extends another model. An Avro record holds no inheritance, and the inherited fields would be lost.`,
        template: `The model "{name}" is a template instance. Two instances of one template share a name, and an Avro schema names each type once.`,
        indexer: `The model "{name}" holds an index signature. An Avro record has fields alone, so the indexed values would be lost.`,
      },
    },
    "unsupported-field": {
      severity: "error",
      messages: {
        optional: `The property "{name}" is optional, which is not supported yet.`,
        default: `The property "{name}" carries a default, which is not supported yet.`,
      },
    },
    "enum-member-value": {
      severity: "error",
      messages: {
        default: `The enum member "{name}" carries a value of its own. An Avro enum holds symbols alone, so the value would be lost.`,
      },
    },
  },
  emitter: {
    options: EmitterOptionsSchema,
  },
});

/**
 * Reports one diagnostic from this library.
 *
 * @internal
 */
export const reportDiagnostic = $lib.reportDiagnostic.bind($lib);

/**
 * This package's name, as declared in `package.json`.
 *
 * It is also the name a project writes in `tspconfig.yaml`, both under `emit:`
 * and as the key of its options.
 *
 * @public
 */
export const PACKAGE_NAME = "tsp-avro";
