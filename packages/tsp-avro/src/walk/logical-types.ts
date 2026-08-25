/**
 * The logical types the Avro specification defines, and what each is written
 * on.
 *
 * A logical type is an attribute of a type rather than a type of its own. Avro
 * carries a date as an `int` and a timestamp as a `long`, and a reader that
 * knows the attribute builds a date or a timestamp from it. A reader that does
 * not know it reads the number, so the attribute never changes what is on the
 * wire.
 *
 * This table is the only thing that checks an annotation. Measured: `avsc`
 * accepts `{ type: "int", logicalType: "totally-made-up" }` without a word, and
 * it drops the attribute altogether when it writes a schema back out. So a
 * pair the specification does not name would reach a schema registry as a
 * schema no reader understands.
 */

import type { DiagnosticTarget, Program } from "@typespec/compiler";
import type { AvroLogicalTypeAnnotation } from "../decorators/logical-type.js";
import { reportDiagnostic } from "../lib.js";
import {
  isAvroLogical,
  isAvroUnion,
  type AvroFixed,
  type AvroLogical,
  type AvroPrimitiveName,
  type AvroSchema,
} from "../types.js";

/**
 * How wide an Avro duration is. The twelve bytes hold three unsigned four byte
 * numbers: the months, the days and the milliseconds.
 */
const DURATION_SIZE = 12;

/**
 * Each logical type, and the underlying types it is written on.
 *
 * `uuid` is written on a string alone. Avro 1.12 added a fixed type of sixteen
 * bytes, and this package holds to the earlier rule, which every reader
 * accepts.
 */
const LOGICAL_TYPES: ReadonlyMap<string, readonly string[]> = new Map([
  ["decimal", ["bytes", "fixed"]],
  ["uuid", ["string"]],
  ["date", ["int"]],
  ["time-millis", ["int"]],
  ["time-micros", ["long"]],
  ["timestamp-millis", ["long"]],
  ["timestamp-micros", ["long"]],
  ["local-timestamp-millis", ["long"]],
  ["local-timestamp-micros", ["long"]],
  ["duration", ["fixed"]],
]);

/**
 * The Avro primitive type names.
 *
 * A schema spelled as a string is either one of these or a reference to a
 * named type declared earlier in the same file. Nothing else is a string.
 */
const AVRO_PRIMITIVES: ReadonlySet<string> = new Set([
  "null",
  "boolean",
  "int",
  "long",
  "float",
  "double",
  "bytes",
  "string",
]);

/**
 * Writes a logical type onto a schema, or refuses the pair.
 *
 * Two shapes take an annotation, and they are the two the specification names:
 * a primitive, and a fixed type. Everything else is refused, including a
 * reference to a named type: a reference is a name, and the annotation belongs
 * to the definition that name points at.
 *
 * @param program - The program the diagnostic belongs to
 * @param schema - The schema to annotate
 * @param annotation - What the author declared
 * @param target - Where a diagnostic points
 * @returns The annotated schema, or undefined when the pair was refused
 *
 * @internal
 */
export function applyLogicalType(
  program: Program,
  schema: AvroSchema,
  annotation: AvroLogicalTypeAnnotation,
  target: DiagnosticTarget,
): AvroLogical | AvroFixed | undefined {
  const allowed = LOGICAL_TYPES.get(annotation.name);
  if (allowed === undefined) {
    reportDiagnostic(program, {
      code: "unknown-logical-type",
      format: { name: annotation.name, known: [...LOGICAL_TYPES.keys()].join(", ") },
      target,
    });
    return undefined;
  }

  const underlying = underlyingOf(schema);
  if (underlying === undefined || !allowed.includes(underlying)) {
    reportDiagnostic(program, {
      code: "logical-type-mismatch",
      format: {
        name: annotation.name,
        underlying: describe(schema, underlying),
        allowed: allowed.join(" or "),
      },
      target,
    });
    return undefined;
  }

  if (annotation.name === "decimal" && annotation.precision === undefined) {
    reportDiagnostic(program, { code: "invalid-decimal", messageId: "missing", target });
    return undefined;
  }

  const fixed = underlying === "fixed" ? (schema as AvroFixed) : undefined;
  if (annotation.name === "duration" && fixed?.size !== DURATION_SIZE) {
    reportDiagnostic(program, { code: "logical-type-mismatch", messageId: "duration", target });
    return undefined;
  }

  if (fixed !== undefined) {
    return {
      ...fixed,
      logicalType: annotation.name,
      precision: annotation.precision,
      scale: annotation.scale,
    };
  }

  return {
    type: schema as AvroPrimitiveName,
    logicalType: annotation.name,
    precision: annotation.precision,
    scale: annotation.scale,
  };
}

/**
 * What a schema is, as the table above compares it.
 *
 * @returns The primitive name, or `fixed`, or undefined when the schema is
 *   nothing an annotation can be written on
 */
function underlyingOf(schema: AvroSchema): string | undefined {
  if (isAvroUnion(schema)) {
    return undefined;
  }
  if (typeof schema === "string") {
    return AVRO_PRIMITIVES.has(schema) ? schema : undefined;
  }
  return schema.type === "fixed" ? "fixed" : undefined;
}

/**
 * Names the underlying type in a refusal, so the message says what was found.
 */
function describe(schema: AvroSchema, underlying: string | undefined): string {
  if (underlying !== undefined) {
    return underlying;
  }
  if (isAvroUnion(schema)) {
    return "a union";
  }
  if (typeof schema === "string") {
    // Every named type this package writes carries a namespace, so a string
    // that is no primitive is a reference to one.
    return `a reference to "${schema}"`;
  }
  return isAvroLogical(schema) ? `the logical type "${schema.logicalType}"` : schema.type;
}
