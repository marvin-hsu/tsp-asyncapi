import { DecoratorContext, Model, ModelProperty, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";

const jsonSchemaExtensionStateKey = Symbol.for("tsp-asyncapi.jsonSchemaExtension");

/**
 * One raw key/value pair recorded by `@jsonSchemaExtension`.
 * It is the element type `getJsonSchemaExtensions` returns, so it is part of
 * the public surface.
 * @public
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

/**
 * @param program - The program to read the state from
 * @param target - The type the decorator was applied to
 *
 *  @public
 */
export function getJsonSchemaExtensions(
  program: Program,
  target: Model | ModelProperty,
): JsonSchemaExtensionRecord[] {
  // Copy the array and every entry. The stored array is the one the decorator
  // pushes into, so handing it out lets a caller sort or push and change what
  // the emitter writes.
  return (getJsonSchemaExtensionsInternal(program, target) ?? []).map((record) => ({ ...record }));
}
