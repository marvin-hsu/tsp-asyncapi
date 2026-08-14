import {
  DecoratorContext,
  Namespace,
  Type,
  Program,
  Union,
  Model,
  ModelProperty,
} from "@typespec/compiler";
import { useStateMap, useStateSet } from "@typespec/compiler/utils";

/** @public */
export const namespace = "AsyncAPI";

const infoStateKey = Symbol.for("typespec-asyncapi.info");

/**
 * State interface representing the extracted info data.
 * @internal
 */
export interface AsyncAPIInfoState {
  version: string;
  description?: string;
  termsOfService?: string;
  contact?: { name?: string; url?: string; email?: string };
  license?: { name: string; url?: string };
}

const [getInfoInternal, setInfo] = useStateMap<Namespace, AsyncAPIInfoState>(infoStateKey);

/**
 * Sets the AsyncAPI `info` metadata for the service.
 *
 * @param context - The decorator context
 * @param target - The namespace to apply this decorator to
 * @param info - The info object matching AsyncAPIInfo shape
 *
 * @example
 * ```typespec
 * @info(#{
 *   version: "1.0.0",
 *   description: "This is a sample Order Service API.",
 *   contact: #{ name: "API Support", email: "support@example.com" },
 *   license: #{ name: "MIT", url: "https://opensource.org/licenses/MIT" }
 * })
 * namespace Orders;
 * ```
 *
 * @public
 */
export function $info(context: DecoratorContext, target: Namespace, info: AsyncAPIInfoState) {
  const infoData: AsyncAPIInfoState = { ...info };
  if (!infoData.version) infoData.version = "0.0.0";
  setInfo(context.program, target, infoData);
}

/**
 * Reads back the AsyncAPI `info` metadata set by `@info`.
 *
 * @param program - The program to read the state from
 * @param target - The namespace the decorator was applied to
 * @returns The recorded info state, or `undefined` when the decorator was
 * never applied
 *
 * @public
 */
export function getInfo(program: Program, target: Namespace): AsyncAPIInfoState | undefined {
  return getInfoInternal(program, target);
}

const externalDocsKey = Symbol.for("typespec-asyncapi.externalDocs");

/**
 * State interface representing external documentation.
 * @internal
 */
export interface ExternalDocsState {
  url: string;
  description?: string;
}

const [getExternalDocsInternal, setExternalDocs] = useStateMap<Type, ExternalDocsState>(
  externalDocsKey,
);

/**
 * Attaches external documentation to a component or namespace.
 *
 * @param context - The decorator context
 * @param target - The target type
 * @param url - The URL for the target documentation
 * @param description - A short description of the target documentation
 *
 * @example
 * ```typespec
 * @externalDocs("https://example.com/docs", "Find more info here")
 * namespace Orders;
 * ```
 *
 * @public
 */
export function $externalDocs(
  context: DecoratorContext,
  target: Type,
  url: string,
  description?: string,
) {
  setExternalDocs(context.program, target, { url, description });
}

/**
 * Reads back the external documentation set by `@externalDocs`.
 *
 * @param program - The program to read the state from
 * @param target - The type the decorator was applied to
 * @returns The recorded external-docs state, or `undefined` when the
 * decorator was never applied
 *
 * @public
 */
export function getExternalDocs(program: Program, target: Type): ExternalDocsState | undefined {
  return getExternalDocsInternal(program, target);
}

const oneOfStateKey = Symbol.for("typespec-asyncapi.oneOf");

const [isOneOfInternal, markOneOf] = useStateSet<Union>(oneOfStateKey);

/**
 * Marks a union to emit `oneOf` instead of the default `anyOf` for its
 * variants.
 * This is a plain marker, a union either is or isn't in the set, matching
 * `@typespec/json-schema`'s own `$oneOf` decorator shape. It carries no
 * value of its own to look up.
 *
 * @param context - The decorator context
 * @param target - The union to mark
 *
 * @example
 * ```typespec
 * @oneOf
 * union Shape { Circle, Square }
 * ```
 *
 * @public
 */
export function $oneOf(context: DecoratorContext, target: Union) {
  markOneOf(context.program, target);
}

/**
 * Tells whether `@oneOf` marks this union.
 *
 * @param program - The program to read the state from
 * @param target - The union to test
 * @returns True when the decorator was applied to `target`
 *
 * @public
 */
export function isOneOf(program: Program, target: Union): boolean {
  return isOneOfInternal(program, target);
}

const jsonSchemaExtensionStateKey = Symbol.for("typespec-asyncapi.jsonSchemaExtension");

/**
 * One raw key/value pair recorded by `@jsonSchemaExtension`.
 * @internal
 */
export interface JsonSchemaExtensionRecord {
  key: string;
  value: unknown;
}

const [getJsonSchemaExtensionsInternal, setJsonSchemaExtensions] = useStateMap<
  Model | ModelProperty,
  JsonSchemaExtensionRecord[]
>(jsonSchemaExtensionStateKey);

/**
 * Adds one raw key/value pair to a model's or property's own emitted schema.
 * This decorator is repeatable. Each application appends its own
 * `{ key, value }` record rather than replacing a prior one, so applying it
 * more than once on the same target accumulates every pair, matching
 * `@typespec/json-schema`'s own `@extension` decorator.
 *
 * @param context - The decorator context
 * @param target - The model or property to attach the extension to
 * @param key - The schema keyword name, e.g. `"unevaluatedProperties"`
 * @param value - The value for that keyword
 *
 * @example
 * ```typespec
 * @jsonSchemaExtension("unevaluatedProperties", false)
 * @jsonSchemaExtension("propertyNames", #{ pattern: "^[a-z]+$" })
 * model Order { id: string; }
 * ```
 *
 * @public
 */
export function $jsonSchemaExtension(
  context: DecoratorContext,
  target: Model | ModelProperty,
  key: string,
  value: unknown,
) {
  const existing = getJsonSchemaExtensionsInternal(context.program, target) ?? [];
  existing.push({ key, value });
  setJsonSchemaExtensions(context.program, target, existing);
}

/** @public */
export function getJsonSchemaExtensions(
  program: Program,
  target: Model | ModelProperty,
): JsonSchemaExtensionRecord[] {
  return getJsonSchemaExtensionsInternal(program, target) ?? [];
}
