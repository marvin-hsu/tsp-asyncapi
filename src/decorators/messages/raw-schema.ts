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
import { MultiFormatSchemaObject } from "../../types/index.js";
import { trimmed } from "../../optional-fields.js";

/**
 * True when a value is text that opens a JSON object or array.
 *
 * Used to tell a schema written as serialized text from one that is a JSON
 * string in its own right.
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
 * Builds the slot one raw schema decorator uses.
 *
 * The two decorators differ in three things only: the state they write, the
 * diagnostic they report for a second application, and the field they fill.
 * Everything else is one piece of code here. So a rule about a
 * `schemaFormat` value or about a schema value has one definition, and the
 * two slots cannot drift apart.
 *
 * @param stateKey - A symbol private to the calling decorator
 * @param appliedKey - A second symbol, for the single-application guard
 * @param duplicateCode - The diagnostic reported for a second application
 * @returns The slot for that decorator
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
      // Decorators on one declaration run bottom-up, so the application
      // written last in the source runs first and wins. The guard records
      // that this decorator ran, before any value is validated, so a value
      // that fails validation still blocks a later application.
      if (!guard.claim(context, target)) return;

      const format = resolveSchemaFormat(context, schemaFormat);
      if (format === undefined) return;

      const value = toPlainValue(context.program, schema);
      if (value === undefined || value === null) {
        // `toPlainValue` returns `undefined` for a value the serializer
        // cannot represent. Writing it would put a `schema` key with no
        // value into the document, which no JSON document can hold.
        //
        // `null` takes the same route. The specification requires `schema`,
        // and it requires the value to match `schemaFormat`. `null` names no
        // schema in any of the listed formats. So the message falls back to
        // the payload built from the model, rather than emitting a Multi
        // Format Schema Object that describes nothing.
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
 * Reports the two rules that hold between a `schemaFormat` and its schema.
 *
 * Both rules are reported and the schema is still recorded. The emitter writes
 * what the author wrote, the same choice `unknown-schema-format` makes. The
 * author decides which half to change, and neither half disappears from the
 * document while the error is open.
 *
 * The value itself is not read any deeper than these two rules need. A raw
 * schema is opaque by design, so the emitter checks only what it can decide
 * from the format alone.
 *
 * @param context - The decorator context
 * @param target - The model the decorator sits on
 * @param format - The resolved format
 * @param value - The schema, converted to plain JSON
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
  // The other half of the same sentence. A JSON based schema language has an
  // object form, and AsyncAPI requires the schema to be inlined as one rather
  // than as text waiting to be parsed. Only the non-JSON direction was checked
  // before, so serialized text reached the document and the official parser
  // rejected it while this emitter exited clean.
  //
  // The test is whether the string opens a JSON object or array, not whether
  // it is a string at all. A JSON string can be a whole schema on its own:
  // Avro names its primitives that way, so `"string"` is a schema and not text
  // to be parsed. Reading further would mean parsing the value, and this
  // emitter never looks inside `schema`.
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
 * Only the top level of the schema is read. A reference nested inside the
 * schema is written in the schema language itself, and the emitter does not
 * know the grammar of that language. The top-level form is the same in every
 * JSON based language the specification lists, so it is the one form the
 * emitter can decide.
 *
 * Two checks read this one answer. The decorator compares the two
 * `schemaFormat` values. The document builder resolves the target. So the
 * form of a local reference has one definition.
 *
 * @param value - The schema, converted to plain JSON
 * @returns The reference, or `undefined` when the top level makes none
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
 * A blank format names no schema language, so it is reported and the whole
 * decorator is dropped. The value is written by hand, so it is reported
 * rather than replaced with something the author never asked for.
 *
 * `trimmed` answers whether the format says anything, and it answers with the
 * value to use. One call therefore decides the blank rule, the value the
 * check below compares, and the value the emitter writes. Spaces around a
 * listed identifier would otherwise make it look unlisted, and the padded
 * string would reach the document.
 *
 * A format outside the list AsyncAPI names is only warned about. The
 * specification allows a custom value, so the emitter must still write it.
 * The specification also states that a custom value must not collide with a
 * listed one. The emitter cannot check that rule, because it cannot see that
 * a listed identifier now carries another meaning. So the warning carries the
 * rule instead.
 *
 * @param context - The decorator context
 * @param schemaFormat - The argument as the author wrote it
 * @returns The format to record, or `undefined` when the decorator is dropped
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
