import { Model, ModelProperty, Program, resolveEncodedName } from "@typespec/compiler";
import { isNeverTypedProperty } from "./scalars.js";
import { SCHEMA_ENCODING_MIME_TYPE } from "./annotations.js";

/**
 * Finds the property named `name` on `model` or any ancestor.
 * The search walks the `baseModel` chain.
 * `name` is the TypeSpec declaration name, for example the `x` in
 * `@discriminator("x")`. See `applyDiscriminator`'s doc comment for more.
 * A derived model's assembled schema is `{ allOf: [{ $ref: Base }, own] }`.
 * So the discriminating property may be declared on `Base` rather than on
 * `model` itself. This walk keeps the presence check in agreement with the
 * schema it actually checks.
 * `never`-typed properties are skipped and treated as not found.
 * `buildObjectSchema` never emits them either.
 */
export function findDiscriminatingProperty(model: Model, name: string): ModelProperty | undefined {
  for (let current: Model | undefined = model; current !== undefined; current = current.baseModel) {
    for (const prop of current.properties.values()) {
      if (prop.name === name && !isNeverTypedProperty(prop)) {
        return prop;
      }
    }
  }
  return undefined;
}

/**
 * Finds an own property of `model` whose wire name collides with an
 * ancestor property's wire name.
 * The wire name comes from `resolveEncodedName(..., SCHEMA_ENCODING_MIME_TYPE)`.
 * The ancestor property is reached via `model.baseModel`.
 * The collision matters because `applyExtends`'s usual shape,
 * `{ allOf: [{ $ref: Base }, own] }`, cannot represent it.
 * `applyExtends` builds that shape on one assumption: an overriding property
 * in `own` narrows the exact same key the base branch constrains.
 * That assumption breaks in two distinct ways.
 *
 * 1. **Same TypeSpec name, different wire name.** The override carries its
 *    own `@encodedName`. So `own` keys `properties`/`required` by the
 *    override's wire name. The base branch is a `$ref` to an already-built,
 *    shared schema. It still keys the same conceptual property by the
 *    ancestor's wire name. Both wire names end up required at once.
 * 2. **Different TypeSpec name, same wire name.** `own` declares a *new*
 *    property that does not override any same-named ancestor property.
 *    That new property's own `@encodedName` happens to resolve to the same
 *    wire name an *unrelated* ancestor property already uses. The base
 *    branch and `own` then both constrain that one JSON key. They do so
 *    with two independent, typically incompatible schemas, combined under
 *    `allOf`'s AND semantics.
 *
 * Either way, a payload built from `model` itself can never satisfy both
 * branches. Nothing validates.
 * `applyExtends` uses this function to detect the conflict. It then falls
 * back to a fully flattened schema instead (see
 * `SchemaBuilder.buildFlattenedObjectSchema`).
 *
 * `never`-typed properties are skipped throughout, whether own or ancestor.
 * They contribute no key to the emitted schema either way (see
 * `isNeverTypedProperty`).
 */
export interface EncodedNameOverrideConflict {
  property: ModelProperty;
  /**
   * A phrase that completes "Property \"x\" ${reason}".
   * It names which of the two conflict shapes above was found.
   */
  reason: string;
}

/**
 * Collects every ancestor property's wire name reachable through `model`'s
 * `baseModel` chain.
 * The first, most-derived match wins for a given wire name.
 * This is the same precedence `walkPropertiesInherited` gives an override.
 */
function collectAncestorWireNames(program: Program, baseModel: Model): Map<string, ModelProperty> {
  const ancestorWireNames = new Map<string, ModelProperty>();
  for (
    let current: Model | undefined = baseModel;
    current !== undefined;
    current = current.baseModel
  ) {
    for (const prop of current.properties.values()) {
      if (isNeverTypedProperty(prop)) {
        continue;
      }
      const wireName = resolveEncodedName(program, prop, SCHEMA_ENCODING_MIME_TYPE);
      if (!ancestorWireNames.has(wireName)) {
        ancestorWireNames.set(wireName, prop);
      }
    }
  }
  return ancestorWireNames;
}

/**
 * Checks a single own property of `model` for either conflict shape.
 * See `findEncodedNameOverrideConflict`'s doc comment above for the two
 * shapes.
 * This check is split into its own function so each case can use an early
 * return. That keeps the per-property branching out of the caller's own
 * loop.
 */
function checkPropertyEncodedNameConflict(
  program: Program,
  baseModel: Model,
  prop: ModelProperty,
  ancestorWireNames: Map<string, ModelProperty>,
): EncodedNameOverrideConflict | undefined {
  const ownWireName = resolveEncodedName(program, prop, SCHEMA_ENCODING_MIME_TYPE);
  const sameNameAncestor = findDiscriminatingProperty(baseModel, prop.name);
  if (sameNameAncestor !== undefined) {
    // Case 1: a same-named override.
    // This is a conflict only when the wire names actually diverge.
    // A consistent override, such as same name and same wire name with no
    // `@encodedName` at all, is not a conflict.
    const ancestorWireName = resolveEncodedName(
      program,
      sameNameAncestor,
      SCHEMA_ENCODING_MIME_TYPE,
    );
    if (ownWireName === ancestorWireName) {
      return undefined;
    }
    return {
      property: prop,
      reason: `overrides an inherited property but resolves to a different wire name ("${ownWireName}" vs "${ancestorWireName}") via @encodedName.`,
    };
  }
  // Case 2: there is no same-named ancestor.
  // But this new property's wire name still collides with a *different*
  // ancestor property's wire name.
  if (ancestorWireNames.has(ownWireName)) {
    return {
      property: prop,
      reason:
        "resolves to the same wire name (via @encodedName) as a different, unrelated inherited property.",
    };
  }
  return undefined;
}

export function findEncodedNameOverrideConflict(
  program: Program,
  model: Model,
): EncodedNameOverrideConflict | undefined {
  if (model.baseModel === undefined) {
    return undefined;
  }
  const ancestorWireNames = collectAncestorWireNames(program, model.baseModel);
  for (const prop of model.properties.values()) {
    if (isNeverTypedProperty(prop)) {
      continue;
    }
    const conflict = checkPropertyEncodedNameConflict(
      program,
      model.baseModel,
      prop,
      ancestorWireNames,
    );
    if (conflict !== undefined) {
      return conflict;
    }
  }
  return undefined;
}

/**
 * Finds an own property of `model` that is `never`-typed and that overrides
 * a same-named, non-`never` ancestor property.
 * The ancestor property is reached via `model.baseModel`.
 * `never`-typed means "this property does not exist" (see
 * `isNeverTypedProperty`).
 * `buildObjectSchemaFromProperties` and `walkPropertiesInherited` both honor
 * that convention for a model built via the flattened path.
 * But `applyExtends`'s usual shape, `{ allOf: [{ $ref: Base }, own] }`,
 * never consults the base's properties when it assembles `own`.
 * So the inherited, non-`never` property would still be required through
 * the `$ref` branch. This silently contradicts the same TypeSpec input's
 * effective shape under the flattened path.
 * `applyExtends` uses this function to route such a model through the same
 * flattened fallback instead (`SchemaBuilder.buildFlattenedObjectSchema`).
 * This keeps both code paths in agreement: the overridden property is
 * dropped, not silently still required.
 */
export function findNeverOverrideOfInheritedProperty(model: Model): ModelProperty | undefined {
  if (model.baseModel === undefined) {
    return undefined;
  }
  for (const prop of model.properties.values()) {
    if (!isNeverTypedProperty(prop)) {
      continue;
    }
    if (findDiscriminatingProperty(model.baseModel, prop.name) !== undefined) {
      return prop;
    }
  }
  return undefined;
}
