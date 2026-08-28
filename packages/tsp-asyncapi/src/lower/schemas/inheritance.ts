/**
 * What an `extends` chain does to a schema.
 *
 * A model that extends another states part of its shape somewhere else.
 * Every rule about that lives here. The base is composed into `allOf`.
 * Two conflicts force the shape flat instead, and the flattening lives
 * here as well. So does `@discriminator`. That is the one decorator that
 * reads a hierarchy rather than a single type.
 *
 * These rules reach back into the walk that owns them through
 * `InheritanceWalk`. They build referenced types and they assemble
 * objects. Neither is theirs to define.
 */

import {
  Model,
  ModelProperty,
  Program,
  Type,
  getDiscriminator,
  isArrayModelType,
  isRecordModelType,
  resolveEncodedName,
  walkPropertiesInherited,
} from "@typespec/compiler";
import { ReferenceObject, SchemaObject } from "../../types/index.js";
import { isBuiltinCollectionInstantiation, isNeverTypedProperty } from "./scalars.js";
import { SCHEMA_ENCODING_MIME_TYPE, reportDiagnostic } from "tsp-asyncapi-core";
import { SchemaDiagnostics } from "./diagnostics.js";
import { DeclarationRegistry } from "./declarations.js";

/**
 * What the inheritance rules need from the walk that owns them.
 *
 * These rules read a model's `extends` chain. They write the shape it
 * lands in. So they have to reach back into the walk for the parts they
 * do not own. Those parts are building a referenced type, assembling an
 * object out of properties, and the registry that keys a declaration.
 * Naming that reach as an interface is what keeps `schemas.ts` from
 * having to hold these rules to stay reachable.
 */
export interface InheritanceWalk {
  readonly program: Program;
  readonly diagnostics: SchemaDiagnostics;
  readonly declarations: DeclarationRegistry;
  /** Builds any type, inlining or referencing it as that type's rules say. */
  buildSchema(type: Type): SchemaObject | ReferenceObject;
  /** Builds a model as a component and returns a reference to it. */
  buildDeclarationRef(model: Model): SchemaObject | ReferenceObject;
  /** The `array`/`object` shape of a collection-backed model, if it is one. */
  buildCollectionSchema(model: Model): SchemaObject | undefined;
  /** One `object` shape out of the properties handed in. */
  buildObjectSchemaFromProperties(properties: Iterable<ModelProperty>): SchemaObject;
}

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
function findDiscriminatingProperty(model: Model, name: string): ModelProperty | undefined {
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
interface EncodedNameOverrideConflict {
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

function findEncodedNameOverrideConflict(
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

/**
 * What `@discriminator` resolves to on one model.
 *
 * `absent` means the model carries no `@discriminator`. `applies` names the
 * property the keyword points at. The other two are the cases AsyncAPI's
 * Schema Object cannot express, and each is named after the diagnostic that
 * reports it.
 */
export type DiscriminatorResolution =
  | { readonly kind: "absent" }
  | { readonly kind: "applies"; readonly property: ModelProperty }
  | { readonly kind: "missing-discriminator-property"; readonly propertyName: string }
  | { readonly kind: "optional-discriminator-property"; readonly propertyName: string };

/**
 * Resolves `@discriminator` on `model` without changing anything.
 *
 * Two callers ask this question. One writes the keyword onto a schema and
 * queues the model's subtypes. The other only needs the answer. It builds
 * a payload that lifts `@header` fields, which cannot carry the keyword.
 * That caller still has to tell a dropped keyword apart from one that never
 * applied. Answering through a
 * function that builds and queues nothing is what lets the second caller ask
 * without moving the walk along behind its back.
 *
 * `@discriminator("x")` names the property by its TypeSpec declaration name,
 * before any `@encodedName` remap, so the lookup goes by that name. The walk
 * covers the whole `baseModel` chain. The assembled schema of a derived
 * model refers to its base, and the property may be declared there.
 *
 * @param program - The program the model belongs to
 * @param model - The model whose decorator is read
 * @returns Which of the four cases holds
 */
export function resolveDiscriminator(program: Program, model: Model): DiscriminatorResolution {
  const discriminator = getDiscriminator(program, model);
  if (discriminator === undefined) {
    return { kind: "absent" };
  }
  const propertyName = discriminator.propertyName;
  const property = findDiscriminatingProperty(model, propertyName);
  if (property === undefined) {
    return { kind: "missing-discriminator-property", propertyName };
  }
  if (property.optional) {
    return { kind: "optional-discriminator-property", propertyName };
  }
  return { kind: "applies", property };
}

/**
 * Declares every level of `model`'s hierarchy that carries
 * `@discriminator`, and reports the one case a payload cannot express.
 *
 * A discriminator names its variants by their `components.schemas` key. A
 * variant is a subtype of the model that carries the decorator, and every
 * subtype describes the lifted fields as payload data. So a payload that
 * carried the keyword would send a reader to a schema no payload of this
 * message can satisfy. The keyword is left off, and the pair is reported.
 *
 * The polymorphism still reaches the document. The model's own component
 * carries the keyword, and it describes every field. `buildDeclarationRef`
 * builds it, which also queues the subtypes.
 *
 * An ancestor that carries the decorator is declared for a second reason.
 * The payload is flattened, so it inlines the ancestors rather than
 * referring to them, and nothing else would build them. A subtype is
 * reachable through the `extends` link alone (see `flushPendingSubtypes`),
 * so the sibling subtypes of that ancestor would be missing from the
 * document altogether.
 */
export function declareDiscriminatedHierarchy(walk: InheritanceWalk, model: Model): void {
  for (
    let ancestor: Model | undefined = model.baseModel;
    ancestor !== undefined;
    ancestor = ancestor.baseModel
  ) {
    if (getDiscriminator(walk.program, ancestor) !== undefined) {
      walk.buildDeclarationRef(ancestor);
    }
  }
  // A missing or optional discriminating property drops the keyword too,
  // and that is not this conflict. So whether the keyword applies at all
  // is what tells the two apart. The question goes to
  // `discriminatingProperty`, which builds nothing and queues nothing.
  // `applyDiscriminator` would queue this model's subtypes twice, here and
  // at the model's own component. It would do so on the strength of a
  // schema built only to be thrown away.
  if (discriminatingProperty(walk, model) === undefined) {
    return;
  }
  reportDiagnostic(walk.program, {
    code: "discriminated-lifted-header",
    target: model,
    format: { name: model.name },
  });
  walk.buildDeclarationRef(model);
}

/**
 * Converts `model B extends A` to `{ allOf: [{ $ref: A }, own] }`.
 * This registers `A` into `components.schemas`, via the recursive
 * `buildSchema` call, the same way any other named-model reference does,
 * if it is not registered already.
 * `own` is `B`'s own shape, built from only its own declared properties.
 * `model.properties` already excludes inherited members; they live on
 * `baseModel` and are walked separately here. So there is no risk of
 * double-counting a property both in `own` and via the base's `$ref`.
 * A model with no `baseModel`, the common case, returns `own` unchanged.
 * Wrapping every model in a single-element `allOf` would be needlessly
 * noisy.
 *
 * When `own` contributes nothing beyond the bare `{ type: "object" }`
 * shape, the second `allOf` branch is dropped too. This happens when the
 * derived model declares no properties of its own, a common pattern for
 * a `@discriminator` sub-type that only narrows a literal. An empty
 * `{ type: "object" }` sibling adds no constraint. So it is pure noise,
 * against the same omit-empty convention `buildObjectSchema` already
 * follows for `properties`/`required`.
 *
 * `model.baseModel` can itself be array/record-backed: a `Model extends
 * Array<T>`/`Record<T>`, built-in or a named `is` alias. When that is
 * true, *and* `own` contributes nothing beyond the empty
 * `{ type: "object" }` shape, `own` is dropped entirely. It is not paired
 * with the base's actual `array`/`object`-with-`additionalProperties`
 * shape. An `own` kept as the bare `{type:"object"}` sibling would
 * otherwise sit next to a `type:"array"` branch. `allOf` means an implicit
 * AND, so no value could then satisfy the schema.
 * For an *anonymous* base, `Array<T>`/`Record<T>` at the use site, the
 * base's collection shape is then returned directly with no `allOf`
 * wrapper at all. There is no declaration to register or `$ref`.
 * For a *named* `is`-alias base, such as `model Names is string[];`, the
 * base is still a real declaration. It must go through `buildSchema` so
 * its own docs and validation keywords are preserved, and so it is
 * registered into `components.schemas`. So a single-branch
 * `{ allOf: [base] }` is returned instead.
 *
 * An **Array** base can never have a non-empty `own` here. TypeSpec
 * itself rejects declaring properties on top of an array's indexer
 * (`no-array-properties`). So `own` is unconditionally empty in that
 * case.
 * A **Record** base has no such restriction. `model Bag extends
 * Record<T> { count: int32; }` is perfectly legal whenever `count`'s type
 * is compatible with `T`. `own` then carries real
 * `properties`/`required` that must not be discarded.
 * So the emptiness of `own`, not merely whether the base is a collection,
 * is what decides whether it gets folded into the result.
 *
 * A non-empty `own` against a **named** Record-backed alias base is
 * paired into `{ allOf: [base, own] }`, the same shape a non-collection
 * base gets below. `base` there is a real `$ref` that must stay a
 * distinct branch.
 * Against an **anonymous** Record base, though, there is no `$ref` to
 * keep separate. `baseCollection` is already an inline
 * `{ type: "object", additionalProperties: ... }` object. So it is merged
 * directly with `own` into one flat schema; both share `type: "object"`.
 * This avoids wrapping it in a needless single-level-deeper `allOf`, the
 * same omit-unnecessary-nesting convention this function already applies
 * to the `ownIsEmpty` cases above.
 */
export function applyExtends(walk: InheritanceWalk, model: Model, own: SchemaObject): SchemaObject {
  if (model.baseModel === undefined) {
    return own;
  }
  if (reportInheritanceConflicts(walk, model)) {
    return buildFlattenedObjectSchema(walk, model);
  }
  const ownKeys = Object.keys(own);
  const ownIsEmpty = ownKeys.length === 1 && ownKeys[0] === "type";
  // Whether the base is a collection is asked of the base itself, never of
  // a shape built from it. Building the base's collection shape builds its
  // element type. A second build of a declaration is what promotes it from
  // an inline shape to a component. A base built once to answer the question
  // and once again to write the branch below therefore moved its element
  // into `components.schemas`. That happened purely because some model
  // extended the base. See `isBuiltinCollectionInstantiation` for the anonymous
  // case, which is built exactly once here and is the shape that is used.
  if (isBuiltinCollectionInstantiation(model.baseModel)) {
    const baseCollection = walk.buildCollectionSchema(model.baseModel);
    if (baseCollection !== undefined) {
      // See the doc comment above. An anonymous base has no declaration to
      // refer to, so its collection shape is written in place. An empty
      // `own` cannot contradict it, and a non-empty one is an object
      // beside an object.
      return ownIsEmpty ? baseCollection : { ...baseCollection, ...own };
    }
  } else if (isArrayModelType(model.baseModel) || isRecordModelType(model.baseModel)) {
    const named = walk.buildSchema(model.baseModel);
    return ownIsEmpty ? { allOf: [named] } : { allOf: [named, own] };
  }
  const base = walk.buildSchema(model.baseModel);
  if (ownIsEmpty) {
    return { allOf: [base] };
  }
  return { allOf: [base, own] };
}

/**
 * Reports the conflicts an `extends` chain can hold, and says whether the
 * flattened shape must be used in place of `allOf`.
 *
 * An overriding property whose `@encodedName` differs from the same-named
 * ancestor property's makes the usual `{ allOf: [{ $ref: Base }, own] }`
 * shape unsatisfiable. See `findEncodedNameOverrideConflict`'s doc
 * comment. The base branch would still require the ancestor's wire name,
 * while `own` requires the override's. A real payload can only ever carry
 * one of the two.
 *
 * A `never`-typed override of an inherited property means that property
 * does not exist on `model` (see `isNeverTypedProperty`). But `own` never
 * consults the base's properties. So the usual shape would still require
 * it through the `$ref` branch.
 *
 * The flattened shape repairs both. `buildFlattenedObjectSchema` walks
 * `walkPropertiesInherited`. That walk gives an override precedence over
 * the ancestor's definition, and it skips `never`-typed properties.
 *
 * A model can reach this from two builds: its own component, and the
 * payload component of a message that lifts `@header` fields. The
 * conflict belongs to the model rather than to either component, so it is
 * reported once per model.
 *
 * The checks can only arise from a named, property-bearing ancestor. An
 * array base can never have a conflicting property. TypeSpec's own
 * `no-array-properties` rule forbids declaring properties on top of one.
 *
 * @param model - The model to check
 * @returns True when the caller must flatten instead of composing
 */
export function reportInheritanceConflicts(walk: InheritanceWalk, model: Model): boolean {
  if (model.baseModel === undefined) {
    return false;
  }
  const conflict = findEncodedNameOverrideConflict(walk.program, model);
  if (conflict !== undefined) {
    reportModelDiagnosticOnce(walk, model, "encoded-name-override-conflict", {
      property: conflict.property.name,
      reason: conflict.reason,
    });
    return true;
  }
  const neverOverride = findNeverOverrideOfInheritedProperty(model);
  if (neverOverride !== undefined) {
    reportModelDiagnosticOnce(walk, model, "never-typed-property-override", {
      property: neverOverride.name,
    });
    return true;
  }
  return false;
}

/**
 * Reports a diagnostic about `model` at most once per code.
 *
 * A model with lifted `@header` fields is built twice. Its payload
 * component and its own component both resolve the same decorators on the
 * same model. A diagnostic about the model is one mistake either way, and
 * the message names no component. So a second report would put the same
 * text on the same squiggle.
 *
 * The record lives in `diagnostics`, so it is scoped to one builder and
 * one emit.
 */
function reportModelDiagnosticOnce(
  walk: InheritanceWalk,
  model: Model,
  code:
    | "encoded-name-override-conflict"
    | "never-typed-property-override"
    | "missing-discriminator-property"
    | "optional-discriminator-property",
  format: Record<string, string>,
): void {
  walk.diagnostics.reportOnce({ code, target: model, format });
}

/**
 * The property `@discriminator` names on `model`, or `undefined` when the
 * keyword does not apply.
 *
 * `resolveDiscriminator` decides; this adds the report. AsyncAPI 3.x, via
 * draft-07, requires the discriminating property to be defined on the
 * schema and to be required. A `discriminator` naming a property no reader
 * could find is worse than no `discriminator` at all. So the keyword is
 * dropped, and the reason is reported rather than silently swallowed. The
 * compiler itself never validates this.
 *
 * The report is deduped per model, so both callers can ask without the
 * author seeing one mistake twice.
 */
function discriminatingProperty(walk: InheritanceWalk, model: Model): ModelProperty | undefined {
  const resolution = resolveDiscriminator(walk.program, model);
  switch (resolution.kind) {
    case "applies":
      return resolution.property;
    case "absent":
      return undefined;
    default:
      reportModelDiagnosticOnce(walk, model, resolution.kind, {
        property: resolution.propertyName,
      });
      return undefined;
  }
}

/**
 * Applies `@discriminator` to the fully-assembled `schema` for `model`.
 * This is the older, `extends`-chain-based discriminator decorator.
 * AsyncAPI 3.x's Schema Object represents it as a bare string naming the
 * discriminating property. This differs from OpenAPI 3.0's
 * `{ propertyName, mapping }` object.
 *
 * Whether the keyword applies is decided by `discriminatingProperty`,
 * which also reports the two cases that drop it.
 *
 * `@discriminator("x")` names the property by its **TypeSpec** declaration
 * name, not its wire name. Only once the property is found is its wire
 * name computed, via `resolveEncodedName`, and written into
 * `schema.discriminator`. That is the key that actually appears under
 * `properties`/`required` (see `buildObjectSchema`).
 * Matching wire name against `discriminator.propertyName`, as an earlier
 * version of this code did, silently breaks the moment the
 * discriminating property has its own `@encodedName`.
 *
 * This uses a deliberate lenient interpretation. When the
 * discriminating property is found only on an ancestor (`Base` above),
 * `discriminator` is still written onto `schema`. `schema` itself has no
 * own `properties`/`required` naming the property. Only the assembled
 * `{ allOf: [{ $ref: Base }, own] }` names it.
 * AsyncAPI 3.x's Schema Object text says the property "MUST be defined at
 * this schema and ... in the required property list". Read literally,
 * that would require copying the ancestor's property definition into
 * `own` on every discriminated subtype.
 * This is intentionally not done. A `discriminator` is read after
 * resolving `allOf`; every validator and codegen this project has
 * checked against does so. So a property defined in an `allOf` branch
 * reachable via `$ref` is, in practice, "defined at this schema".
 * Copying it into every subtype's `own` would duplicate the property's
 * definition. The base and every subtype would then hold it, kept in sync
 * by hand, for no behavioral gain. It would also fight the same omit-duplication
 * principle `applyExtends` already follows: `own` excludes inherited
 * members precisely so they are not double-counted against the base's
 * `$ref`.
 * Do not "fix" this by re-declaring the property in `own`. That is the
 * discussed and rejected alternative, not an oversight.
 */
export function applyDiscriminator(
  walk: InheritanceWalk,
  model: Model,
  schema: SchemaObject,
): SchemaObject {
  const prop = discriminatingProperty(walk, model);
  if (prop === undefined) {
    return schema;
  }
  // The emitted schema now advertises a polymorphic payload. Its variants
  // must be present in `components.schemas` for that to mean anything. The
  // subtypes are queued rather than built here, so this model's own entry
  // lands first. See `flushPendingSubtypes`.
  // Nothing is queued when the checks above dropped `discriminator`. The
  // emitted schema then advertises no polymorphism, so a subtype that no
  // message reaches stays out of the document.
  walk.declarations.queueSubtypes(model);
  const wireName = resolveEncodedName(walk.program, prop, SCHEMA_ENCODING_MIME_TYPE);
  return { ...schema, discriminator: wireName };
}

/**
 * Builds the fully flattened `object` shape for `model`.
 * It includes every property reachable through the `baseModel` chain,
 * inlined into one schema with no `allOf`/`$ref` to an ancestor. An
 * overriding property in a more-derived level wins over the same-named
 * ancestor's, exactly as `walkPropertiesInherited` already resolves.
 * `applyExtends` uses this as the fallback when
 * `findEncodedNameOverrideConflict` finds an override whose
 * `@encodedName` differs from its ancestor's. The normal
 * `{ allOf: [{ $ref: Base }, own] }` shape would then key the two branches
 * by two different wire names. Both names would stand for the same
 * conceptual property. The assembled schema would reject every valid
 * payload.
 * `buildPayloadShape` uses it for the payload component of a message that
 * lifts `@header` fields, and hands in those fields as `omitted`. That
 * payload must flatten for a reason of its own. A lifted field can be
 * inherited, and an `allOf` branch to the base would bring it back.
 *
 * @param model - The model to flatten
 * @param omitted - Properties to leave out of the result
 */
export function buildFlattenedObjectSchema(
  walk: InheritanceWalk,
  model: Model,
  omitted: ReadonlySet<ModelProperty> = new Set(),
): SchemaObject {
  const kept = [...walkPropertiesInherited(model)].filter((property) => !omitted.has(property));
  const schema = walk.buildObjectSchemaFromProperties(kept);
  // The flattened shape has no `$ref`/`allOf` back to any ancestor.
  // So an indexer constraint, `additionalProperties`, declared on
  // `model` itself or inherited from a `baseModel`, would otherwise be
  // silently dropped. Walk the chain, mirroring how the compiler itself
  // resolves an inherited indexer, for the nearest one, and merge it in.
  for (let current: Model | undefined = model; current !== undefined; current = current.baseModel) {
    const collection = walk.buildCollectionSchema(current);
    if (collection !== undefined) {
      return { ...collection, ...schema };
    }
  }
  return schema;
}
