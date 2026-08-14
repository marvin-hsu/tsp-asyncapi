import { Namespace } from "@typespec/compiler";

/**
 * JSON Schema `type` keyword values this emitter emits. `SchemaObject.type`
 * (see `src/types/index.ts`) is typed as plain `string`, not a string-literal
 * union, so nothing in the type system catches a typo in one of these the way
 * a `Type["kind"]` discriminated-union branch would — collecting them here
 * turns a typo into a single-point fix instead of a silent divergence at one
 * of the many call sites that used to spell the literal out separately.
 */
export const JSON_SCHEMA_TYPE = {
  string: "string",
  number: "number",
  integer: "integer",
  boolean: "boolean",
  null: "null",
  array: "array",
  object: "object",
} as const;

/** Name of the compiler's built-in global namespace (home of `Array`, `Record`, ...). */
const TYPESPEC_NAMESPACE_NAME = "TypeSpec";

/**
 * True for the namespace node representing the compiler's built-in
 * `TypeSpec` namespace itself — the one sitting directly under the global
 * (unnamed) namespace — as opposed to any other namespace, including a
 * user one that happens to share the name. Shared by every call site that
 * previously spelled out `ns?.name === "TypeSpec" && !ns.namespace?.name`
 * (or the equivalent `ns.namespace?.name === ""` form) separately.
 */
export function isGlobalTypeSpecNamespace(ns: Namespace | undefined): boolean {
  return ns?.name === TYPESPEC_NAMESPACE_NAME && !ns.namespace?.name;
}

/** Fallback base name for an anonymous `Model` template argument with no properties to derive one from. */
export const ANONYMOUS_MODEL_NAME_TOKEN = "Anonymous";

/** Fallback base name for an anonymous `Union` template argument with no variants to derive one from. */
export const ANONYMOUS_UNION_NAME_TOKEN = "Union";
