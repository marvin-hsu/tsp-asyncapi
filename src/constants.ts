import { Namespace } from "@typespec/compiler";

/**
 * JSON Schema `type` keyword values this emitter emits.
 * `SchemaObject.type` is typed as plain `string`, not a string-literal
 * union. So nothing in the type system catches a typo in one of these
 * values, the way a `Type["kind"]` discriminated-union branch would.
 * Collecting the values here turns a typo into a single-point fix. It
 * replaces the old approach of spelling out the literal separately at
 * each call site, which could silently drift out of sync.
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
 * `TypeSpec` namespace itself. This is the namespace sitting directly
 * under the global (unnamed) namespace. It is not any other namespace,
 * including a user namespace that happens to share the name. Every call
 * site used to spell out `ns?.name === "TypeSpec" && !ns.namespace?.name`
 * (or the equivalent `ns.namespace?.name === ""` form) separately. This
 * function replaces all of those separate checks.
 */
export function isGlobalTypeSpecNamespace(ns: Namespace | undefined): boolean {
  return ns?.name === TYPESPEC_NAMESPACE_NAME && !ns.namespace?.name;
}

/**
 * The AsyncAPI specification version every emitted document declares.
 *
 * The emitter targets 3.1 throughout: the shape of the document, the
 * Schema Object dialect, and the key charsets all follow that release.
 * Naming it here means the version and the reason for it sit together,
 * rather than appearing as a bare string in the document builder.
 */
export const ASYNCAPI_VERSION = "3.1.0";

/**
 * The `info.title` used when nothing supplies one.
 *
 * This applies when the program declares no `@service` at all, and when a
 * service declares no title. Both cases mean the same thing, so they use
 * the same value.
 */
export const DEFAULT_DOCUMENT_TITLE = "AsyncAPI Document";

/**
 * The `info.version` used when nothing supplies one.
 *
 * AsyncAPI requires `info.version`, so the emitter cannot leave it out.
 * This applies when the program declares no `@service`, when `@info` is
 * absent, and when `@info` carries no version.
 */
export const DEFAULT_INFO_VERSION = "0.0.0";
