import { DecoratorContext, Model, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../../lib.js";
import { DuplicateCode, singleApplication } from "../single-application.js";
import { isPlainObject, toPlainValue } from "../../marshalled-values.js";
import {
  LOCAL_REF_PREFIX,
  MULTI_FORMAT_SCHEMA_FORMATS,
  NATIVE_SCHEMA_FORMATS,
  NON_JSON_SCHEMA_FORMATS,
} from "../../constants.js";
import type { MultiFormatSchemaObject } from "../../types/index.js";
import { trimmed } from "../../optional-fields.js";

/**
 * Shared engine behind `@rawPayload` and `@rawHeaders`: a raw schema of
 * another format, recorded verbatim into one slot of the Message Object.
 * Both decorators differ only in the state key, the diagnostic code, and
 * the field they fill. This module never reads inside the schema value
 * itself; validation stops at `schemaFormat` and the top-level shape.
 */

/**
 * True when a value is text that opens a JSON object or array.
 *
 * Tells serialized-text schemas from a JSON string that is a schema on its
 * own (e.g. Avro's `"string"` primitive).
 */
function looksLikeSerializedJson(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const opener = value.trimStart().charAt(0);
  return opener === "{" || opener === "[";
}

/**
 * One schema a decorator recorded verbatim, and the format it is written in.
 *
 * The state is the Multi Format Schema Object itself. The emitter never reads
 * inside `schema`, so there is nothing to translate between the two. One
 * declaration of the shape also means a new field of the object cannot reach
 * the document from one slot only.
 *
 * `schema` holds whatever the author wrote, converted to plain JSON.
 *
 * @public
 */
export type RawSchemaState = MultiFormatSchemaObject;

/**
 * The key that carries a reference inside a schema, in every JSON based
 * schema language the specification lists.
 */
const REF_KEY = "$ref";

/**
 * One slot of the Message Object that can hold a raw schema.
 *
 * `payload` and `headers` are the two slots. Each one gets its own state map
 * and its own duplicate diagnostic, and both share the validation below.
 */
export interface RawSchemaSlot {
  /**
   * Runs one application of the decorator that owns this slot. A second
   * application is reported and rejected. An invalid value is reported, and
   * nothing is written.
   */
  apply(context: DecoratorContext, target: Model, schemaFormat: string, schema: unknown): void;
  /**
   * Reads back what the decorator recorded, or `undefined` when it never ran
   * with a valid value.
   */
  read(program: Program, target: Model): RawSchemaState | undefined;
}

/**
 * Builds the slot one raw schema decorator uses, so a rule about
 * `schemaFormat` or about the schema value has one definition shared by
 * both slots.
 */
export function rawSchemaSlot(
  stateKey: symbol,
  appliedKey: symbol,
  duplicateCode: DuplicateCode,
): RawSchemaSlot {
  const [getState, setState] = useStateMap<Model, RawSchemaState>(stateKey);
  const guard = singleApplication(appliedKey, duplicateCode);

  return {
    apply(context: DecoratorContext, target: Model, schemaFormat: string, schema: unknown): void {
      // Decorators on one declaration run bottom-up: the last application in
      // source wins. The guard claims before validation, so an invalid value
      // still blocks a later application.
      if (guard.claim(context, target) !== "first") return;

      const format = resolveSchemaFormat(context, schemaFormat);
      if (format === undefined) return;

      const value = toPlainValue(context.program, schema);
      if (value === undefined || value === null) {
        // `undefined` means the serializer could not represent the value.
        // `null` names no schema in any listed format, and the specification
        // requires `schema` to match `schemaFormat`. Either way, the message
        // falls back to the payload built from the model.
        reportDiagnostic(context.program, {
          code: "invalid-raw-schema",
          target: context.getArgumentTarget(1) ?? target,
        });
        return;
      }

      reportSchemaValueRules(context, target, format, value);
      setState(context.program, target, { schemaFormat: format, schema: value });
    },
    read(program: Program, target: Model): RawSchemaState | undefined {
      return getState(program, target);
    },
  };
}

/**
 * Reports the rules that hold between a `schemaFormat` and its schema.
 *
 * Every violation is only reported; the schema is still recorded, the same
 * choice `unknown-schema-format` makes. The value is never read any deeper
 * than these rules need, since a raw schema is opaque by design.
 */
function reportSchemaValueRules(
  context: DecoratorContext,
  target: Model,
  format: string,
  value: unknown,
): void {
  const schemaTarget = context.getArgumentTarget(1) ?? target;
  // A non-JSON schema language has no object form. AsyncAPI states that such
  // a schema MUST be inlined as a string.
  if (NON_JSON_SCHEMA_FORMATS.includes(format) && typeof value !== "string") {
    reportDiagnostic(context.program, {
      code: "non-string-raw-schema",
      target: schemaTarget,
      format: { format },
    });
  }
  // The other half of the same rule: a JSON based schema language must inline
  // the schema as an object, not as text waiting to be parsed. The test is
  // whether the string opens a JSON object or array, not whether it is a
  // string at all — Avro's `"string"` primitive is itself a valid schema.
  if (!NON_JSON_SCHEMA_FORMATS.includes(format) && looksLikeSerializedJson(value)) {
    reportDiagnostic(context.program, {
      code: "string-raw-schema",
      target: schemaTarget,
      format: { format },
    });
  }
  // AsyncAPI states that both ends of a `$ref` must carry the same
  // `schemaFormat`. A reference that starts with `#/` points into this
  // document, and every schema this emitter writes is an AsyncAPI Schema
  // Object. So such a reference disagrees with any other format.
  const ref = localRef(value);
  if (ref !== undefined && !NATIVE_SCHEMA_FORMATS.includes(format)) {
    reportDiagnostic(context.program, {
      code: "raw-schema-local-ref",
      target: schemaTarget,
      format: { format, ref },
    });
  }
}

/**
 * Reads the reference a raw schema makes into this document, if it makes one.
 *
 * Only the top level is read. A nested reference is written in the schema
 * language itself, whose grammar this emitter does not know. Both the
 * decorator's format check and the document builder's target resolution
 * read this one answer, so the form of a local reference has one definition.
 *
 * @internal
 */
export function localRef(value: unknown): string | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const ref: unknown = value[REF_KEY];
  if (typeof ref !== "string" || !ref.startsWith(LOCAL_REF_PREFIX)) {
    return undefined;
  }
  return ref;
}

/**
 * Checks one `schemaFormat` argument and returns the value to record.
 *
 * A blank format names no schema language, so the decorator is dropped.
 * `trimmed` decides the blank rule and supplies the value both the check
 * below and the emitter use, so a padded identifier cannot look unlisted
 * while still reaching the document.
 *
 * A format outside the AsyncAPI list is only warned about: the specification
 * allows a custom value, but also forbids it from colliding with a listed
 * one, a rule this emitter cannot itself verify.
 */
function resolveSchemaFormat(context: DecoratorContext, schemaFormat: string): string | undefined {
  const formatTarget = context.getArgumentTarget(0) ?? context.decoratorTarget;
  const format = trimmed(schemaFormat);
  if (format === undefined) {
    reportDiagnostic(context.program, {
      code: "empty-schema-format",
      target: context.decoratorTarget,
    });
    return undefined;
  }
  if (!MULTI_FORMAT_SCHEMA_FORMATS.includes(format)) {
    reportDiagnostic(context.program, {
      code: "unknown-schema-format",
      target: formatTarget,
      format: { format },
    });
  }
  return format;
}
