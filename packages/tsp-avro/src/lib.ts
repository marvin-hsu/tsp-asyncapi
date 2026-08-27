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

import { createTypeSpecLibrary, paramMessage, type JSONSchemaType } from "@typespec/compiler";

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
        default: paramMessage`"${"name"}" is not a legal Avro name. A name starts with a letter or an underscore, and continues with letters, digits or underscores.`,
        namespace: paramMessage`"${"name"}" is not a legal Avro namespace. A namespace is one or more legal Avro names, joined by dots.`,
        reserved: paramMessage`Avro keeps the name "${"name"}" for a type of its own. A record, an enum and a fixed type take a name that is none of: ${"reserved"}.`,
        alias: paramMessage`"${"name"}" is not a legal Avro alias. An alias of a named type is a full name: one or more legal Avro names, joined by dots.`,
      },
    },
    "unsupported-type": {
      severity: "error",
      messages: {
        default: paramMessage`A property of kind "${"kind"}" has no Avro form.`,
        anonymous: "An anonymous model has no name, and an Avro record needs one.",
        scalar: paramMessage`The scalar "${"name"}" has no Avro form.`,
        intrinsic: paramMessage`The type "${"name"}" has no Avro form.`,
        inheritance: paramMessage`The model "${"name"}" extends another model. An Avro record holds no inheritance, and the inherited fields would be lost.`,
        template: paramMessage`The model "${"name"}" is a template instance. Two instances of one template share a name, and an Avro schema names each type once.`,
        indexer: paramMessage`The model "${"name"}" holds an index signature. An Avro record has fields alone, so the indexed values would be lost.`,
        fixedRecord: paramMessage`The model "${"name"}" carries both @record and @fixed. A file holds one schema, and a fixed type is a width rather than a record, so there is nothing to write.`,
        fixedFields: paramMessage`The model "${"name"}" carries @fixed and declares fields. An Avro fixed type holds a number of bytes and nothing else, so the fields would be lost.`,
        duplicate: paramMessage`"${"name"}" and "${"other"}" both take the Avro name "${"fullName"}". An Avro schema names each type once, so the second would read as the first.`,
        notRecord: paramMessage`The model "${"name"}" did not translate into an Avro record. @record asks for a record, and nothing else can be written in its place.`,
      },
    },
    "aliases-target": {
      severity: "error",
      messages: {
        default: paramMessage`The scalar "${"name"}" carries @aliases and is written as an Avro primitive. An alias stands for a name, and only @fixed gives a scalar one.`,
      },
    },
    "duplicate-union-branch": {
      severity: "error",
      messages: {
        default: paramMessage`Two branches of this union are both the Avro type "${"name"}". An Avro union holds each type once.`,
      },
    },
    "invalid-default": {
      severity: "error",
      messages: {
        unserializable: paramMessage`The default of "${"name"}" has no JSON form the emitter can write. ${"detail"}`,
        branch: paramMessage`The default of "${"name"}" names no one branch of its union. Avro reads a default against the first branch alone, so the branch the default belongs to has to be the one that leads.`,
      },
    },
    "invalid-order": {
      severity: "error",
      messages: {
        default: paramMessage`"${"mode"}" is not an Avro field order. Avro orders a field by "ascending", by "descending", or not at all with "ignore".`,
      },
    },
    "invalid-fixed": {
      severity: "error",
      messages: {
        default: paramMessage`"${"size"}" is not a width an Avro fixed type can have. A fixed type holds a positive number of bytes.`,
        underlying: paramMessage`The scalar "${"name"}" carries @fixed and extends the Avro type "${"underlying"}". An Avro fixed type holds bytes, so a scalar that carries @fixed extends bytes.`,
      },
    },
    "invalid-decimal": {
      severity: "error",
      messages: {
        precision: paramMessage`"${"precision"}" is not a precision an Avro decimal can have. A decimal holds a positive number of digits.`,
        scale: paramMessage`A scale of "${"scale"}" does not fit a precision of "${"precision"}". The scale counts the digits after the point, so it is neither negative nor larger than the precision.`,
        missing: `An Avro decimal is written with a precision and a scale. A reader cannot place the point without them, so use @decimal rather than @logicalType("decimal").`,
        width: paramMessage`A precision of "${"precision"}" does not fit a fixed type of ${"size"} bytes, which hold at most ${"max"} digits.`,
      },
    },
    "unknown-logical-type": {
      severity: "error",
      messages: {
        default: paramMessage`"${"name"}" is not a logical type the Avro specification defines. The specification defines ${"known"}.`,
      },
    },
    "logical-type-mismatch": {
      severity: "error",
      messages: {
        default: paramMessage`The logical type "${"name"}" is written on ${"underlying"}. The Avro specification writes it on ${"allowed"}.`,
        duration: `The logical type "duration" is written on a fixed type of twelve bytes, which hold the months, the days and the milliseconds.`,
        named: paramMessage`The logical type "${"name"}" is written on a field that holds the named type "${"fullName"}". A named type carries one definition wherever it occurs, so the logical type belongs on that declaration.`,
      },
    },
    "duplicate-logical-type": {
      severity: "error",
      messages: {
        default: paramMessage`This declaration carries the logical types "${"first"}" and "${"second"}". Avro writes one logical type on a type, so the second would replace the first.`,
      },
    },
    "enum-default": {
      severity: "error",
      messages: {
        default: paramMessage`The enum "${"enum"}" declares no member named "${"name"}". An Avro enum falls back to one of its own symbols.`,
      },
    },
    "duplicate-record": {
      severity: "error",
      messages: {
        default: paramMessage`"${"name"}" and "${"other"}" both write to "${"path"}". One file holds one schema, so the second would replace the first.`,
      },
    },
    "enum-member-value": {
      severity: "error",
      messages: {
        default: paramMessage`The enum member "${"name"}" carries a value of its own. An Avro enum holds symbols alone, so the value would be lost.`,
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
 * Builds one diagnostic from this library without reporting it.
 *
 * The walk builds its diagnostics with this and hands the list to its caller.
 * Reporting is then the caller's decision, which is what lets an emitter in
 * another package read the reason and say it under its own name. Two emitters
 * over one program would otherwise report every refusal twice.
 *
 * @internal
 */
export const createDiagnostic = $lib.createDiagnostic.bind($lib);

/**
 * This package's name, as declared in `package.json`.
 *
 * It is also the name a project writes in `tspconfig.yaml`, both under `emit:`
 * and as the key of its options.
 *
 * @public
 */
export const PACKAGE_NAME = "tsp-avro";
