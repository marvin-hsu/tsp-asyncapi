import {
  Type,
  Model,
  ModelProperty,
  Scalar,
  Enum,
  Union,
  Program,
  StringLiteral,
  isArrayModelType,
  isRecordModelType,
  walkPropertiesInherited,
  resolveEncodedName,
  getDiscriminator,
} from "@typespec/compiler";
import { SchemaObject, ReferenceObject } from "../../types/index.js";
import { reportDiagnostic } from "../../lib.js";
import { isOneOf } from "../../decorators/index.js";
import { JSON_SCHEMA_TYPE } from "../../constants.js";
import { refFor, isUninstantiatedTemplateDeclaration } from "./schema-naming.js";
import { SchemaKeyRegistry } from "./schema-key-registration.js";
import {
  findDiscriminatingProperty,
  findEncodedNameOverrideConflict,
  findNeverOverrideOfInheritedProperty,
} from "./schema-inheritance.js";
import {
  withDocs,
  withPropertyDocs,
  buildValidationKeywords,
  SCHEMA_ENCODING_MIME_TYPE,
} from "./schema-annotations.js";
import {
  isBuiltinScalar,
  isBuiltinCollectionInstantiation,
  isNeverTypedProperty,
  buildIntrinsicSchema,
  buildEnumSchemaBody,
  buildEnumMemberSchema,
  SCALAR_SCHEMAS,
} from "./schema-scalars.js";

/**
 * Builder for converting TypeSpec types to AsyncAPI Schema Objects.
 */
export class SchemaBuilder {
  // Maps the final `components.schemas` key to its built schema.
  // Entries stay in the order each declaration was first successfully
  // built.
  private readonly declaredSchemas = new Map<string, SchemaObject>();

  private readonly keyRegistry: SchemaKeyRegistry;

  public constructor(private readonly program: Program) {
    this.keyRegistry = new SchemaKeyRegistry(program);
  }

  public getSchemas(): Record<string, SchemaObject> {
    const schemas: Record<string, SchemaObject> = Object.create(null) as Record<
      string,
      SchemaObject
    >;
    for (const [key, value] of this.declaredSchemas) {
      schemas[key] = value;
    }
    return schemas;
  }

  public buildSchema(type: Type): SchemaObject | ReferenceObject {
    switch (type.kind) {
      case "Model":
        return this.buildModelSchema(type);
      case "Scalar":
        return this.buildScalarSchema(type);
      case "Intrinsic":
        return buildIntrinsicSchema(type);
      case "Enum":
        return this.buildEnumSchema(type);
      case "EnumMember":
        return buildEnumMemberSchema(type);
      case "Union":
        return this.buildUnionSchema(type);
      case "String":
        // `enum` is used uniformly for both literals and real enums so 2.6
        // has one code path to maintain; `const` would be equivalent here
        // but would need its own branch.
        return { type: JSON_SCHEMA_TYPE.string, enum: [type.value] };
      case "Number":
        return { type: JSON_SCHEMA_TYPE.number, enum: [type.value] };
      case "Boolean":
        return { type: JSON_SCHEMA_TYPE.boolean, enum: [type.value] };
      default:
        // `Type.kind` has far more variants than this emitter handles, e.g.
        // `Interface`, `Namespace`, `Operation`. TypeScript's static
        // exhaustiveness check cannot catch a missing case here; the
        // `Type` union is deliberately open-ended.
        // A user can reach this branch by mistake, e.g. naming an
        // `Interface` or `Namespace` where a payload/property type is
        // expected. The compiler itself does not reject that; only this
        // emitter does. So report it here rather than silently emitting an
        // unconstrained `{}` schema with no indication anything is wrong.
        // This is deliberately not deduped through `diagnosedTargets`, unlike
        // the range/temporal-constraint diagnostics elsewhere in this class.
        // Those dedupe because a single *scalar* is re-walked at every use
        // site, so the same root cause would otherwise fire once per
        // property. Here, each occurrence is a distinct property or payload
        // location naming the unsupported type; every one of them is a
        // separate mistake the user needs to see and fix at its own call
        // site, not one root cause re-encountered.
        reportDiagnostic(this.program, {
          code: "unsupported-payload-type",
          target: type,
          format: { kind: type.kind },
        });
        return {};
    }
  }

  // Keyed by the type itself, model, enum, or named union, rather than a
  // narrower type. This lets every kind of named declaration share one
  // registry, and with it, one circular-reference guard.
  private readonly building = new Set<Type>();
  // Maps a type whose declaration has already been built and pushed into
  // `declaredSchemas` to its final `components.schemas` key.
  // This is distinct from merely having claimed a key; see
  // `schemaKeys`/`claimedBy` below.
  private readonly declaredTypes = new Map<Type, string>();

  // Dedupes range/length-constraint diagnostics per target and diagnostic
  // code.
  // A scalar is re-walked at every use site (see
  // `buildScalarSchemaShapeWithDocs`). It has no per-type cache the way
  // `registerNamed` gives models, enums, and unions. This map keeps it from
  // being re-diagnosed once per property that uses it.
  private readonly diagnosedTargets = new Map<Type, Set<string>>();

  private buildModelSchema(model: Model): SchemaObject | ReferenceObject {
    if (isUninstantiatedTemplateDeclaration(model)) {
      return {};
    }

    const build = () => {
      // A model can have an `indexer`, which makes `buildCollectionSchema`
      // return a shape. This happens via `is Record<T>`/`is Array<T>`, or
      // via a spread of an indexed model (the compiler's `spreadIndexers`
      // handling sets the same `indexer`).
      // Either way, `model` can *also* declare its own properties, such as
      // `model Bag { id: string; ...Record<string>; }`, and it can also
      // `extends` a base.
      // An array-backed model can never have properties of its own;
      // `no-array-properties` forbids it. So its collection shape *is*
      // `own` outright.
      // A record-backed model's `additionalProperties` constraint and its
      // own declared properties are two independent, mergeable facts about
      // the same object. So both are combined into one `own` shape.
      // `applyExtends` is then always run. It passes `own` through
      // unchanged when `model.baseModel` is `undefined`, rather than being
      // skipped whenever `model` itself happens to be collection-backed.
      // Skipping it would silently drop both the model's own properties,
      // the `Bag` case above, and any inherited shape from `extends`
      // whenever a spread indexer was also present.
      const collection = this.buildCollectionSchema(model);
      let own: SchemaObject;
      if (collection === undefined) {
        own = this.buildObjectSchema(model);
      } else if (isArrayModelType(model)) {
        own = collection;
      } else {
        own = { ...collection, ...this.buildObjectSchema(model) };
      }
      const shape = this.applyExtends(model, own);
      // `@discriminator` is applied here, on the fully-assembled shape.
      // This happens *after* `applyExtends` has already wrapped it in
      // `allOf` when `model` has a `baseModel`, rather than inside
      // `buildObjectSchema`, which only ever sees the own, pre-`allOf`
      // shape.
      // AsyncAPI 3.x's Schema Object reads `discriminator` off the schema
      // object itself. A model that both has a `baseModel` and its own
      // `@discriminator`, such as a 3-level hierarchy or a discriminated
      // sub-hierarchy, would otherwise have `discriminator` buried inside
      // `allOf`'s second branch, where no consumer looks for it.
      // This is called unconditionally, including for a collection-backed
      // model (`collection !== undefined`). The compiler's
      // `extern dec discriminator(target: Model, ...)` legally accepts any
      // Model, including one backed by `Array`/`Record`. So a user *can*
      // write `@discriminator` there, even though it can never resolve to a
      // real property.
      // `applyDiscriminator`'s own `findDiscriminatingProperty` walk
      // already finds nothing in that case. A collection-backed model has
      // no object property matching the discriminator's name. So this
      // reports `missing-discriminator-property` and omits
      // `discriminator`, rather than silently dropping the decorator with
      // no diagnostic at all.
      return withDocs(
        this.program,
        model,
        this.applyDiscriminator(model, shape),
        this.diagnosedTargets,
      );
    };

    // The anonymous use site, such as `string[]` or `Record<int32>`, has no
    // name of its own worth registering. It always inlines.
    // A *named* array/record alias, such as `model Names is string[];`, is
    // a real declaration. It must go through the same register-and-$ref
    // path as any other named model instead. So only the anonymous case
    // returns early here.
    if (isBuiltinCollectionInstantiation(model)) {
      const collection = this.buildCollectionSchema(model);
      if (collection !== undefined) {
        return collection;
      }
    }

    if (!model.name) {
      return this.buildAnonymousGuarded(model, build);
    }
    return this.buildNamedDeclaration(model, build);
  }

  /**
   * Tracks a named declaration that re-entered itself while being inlined.
   * `buildNamedDeclaration` reads it to decide that the inline attempt must
   * be redone as a registered declaration.
   */
  private readonly selfReferencingInlines = new Set<Type>();

  /**
   * Caches the built shape of an unspeakable declaration that inlines.
   * A registered declaration is cached by `declaredTypes` instead, and
   * resolves to a `$ref`. An inlined one has no key to resolve to, so its
   * whole shape is kept here and returned to every later reference site.
   * This keeps the body built exactly once, however many sites reference it.
   */
  private readonly inlinedShapes = new Map<Type, SchemaObject>();

  /**
   * Builds the schema for a *named* `Model` or `Union`, choosing between a
   * registered `components.schemas` entry and an inline shape.
   *
   * A declaration with a compact composed name, such as `Order` or
   * `Envelope<Order>`, always registers. This is the common case.
   *
   * A declaration with no compact composed name is "unspeakable": a
   * template instantiation with a type argument that has no fixed identity
   * of its own to name it after (an anonymous `Model`/`Union`, a literal, a
   * `Tuple`, a value, ... see `templateArgDisplayName`). Such a declaration
   * inlines by preference. `SchemaKeyRegistry` can still key it, through
   * `fallbackDeclarationName`, but that key is long and unreadable, so
   * inlining gives the better document.
   *
   * Inlining cannot express a self-reference. `Node<{x: string}>` with a
   * `children: Node<T>[]` property re-enters itself, and expanding one more
   * level always leaves another self-reference behind. So a re-entry while
   * inlining marks the type and returns a `$ref` to its fallback key. The
   * outer frame sees the mark, discards the inline shape, and registers the
   * declaration instead. Every reference then resolves to one real
   * component.
   * The discarded inline shape is not rebuilt. Its nested self-references
   * already resolved to a `$ref` at this type's fallback key, the same key
   * the registration claims. So that shape is registered directly as the
   * component body.
   * Building it a second time would repeat every diagnostic the first
   * attempt reported. Codes such as `unsupported-payload-type` are
   * deliberately not deduped, so the user would see one mistake reported
   * twice.
   * A later reference to the same promoted declaration returns the cached
   * `$ref` through the `declaredTypes` check below. So the body is built
   * exactly once however many sites reference it.
   */
  private buildNamedDeclaration(
    type: Model | Union,
    build: () => SchemaObject,
  ): SchemaObject | ReferenceObject {
    // An already-declared type resolves straight to its `$ref`. This
    // mirrors `registerNamed`'s own `declaredTypes` guard, and it is what
    // makes a promoted, unspeakable declaration build exactly once no matter
    // how many sites reference it. Without it, a second reference finds
    // `nameFor` still `undefined` and `building` no longer holding the type,
    // so it would re-enter the inline path and rebuild the whole body.
    const declared = this.declaredTypes.get(type);
    if (declared !== undefined) {
      return refFor(declared);
    }
    // A second reference to an unspeakable declaration that already inlined
    // promotes it to a registered component, and every reference from here
    // on resolves to a `$ref` through the `declaredTypes` check above.
    //
    // Inlining is preferred for a single use: the shape reads better in
    // place than behind a long, generated fallback key. But inlining copies
    // the whole shape into every site that uses it. Nested unspeakable
    // declarations then duplicate multiplicatively. A chain where each level
    // references the level below twice emits 2^depth copies of the innermost
    // shape: measured at 1.1 MB for a 12-level chain, and 17 MB at 16
    // levels, from about 20 lines of TypeSpec. Promoting on the second use
    // keeps that growth linear.
    //
    // The already-built shape is registered as the component body rather
    // than rebuilt. Rebuilding would report every diagnostic of the first
    // build a second time; codes such as `unsupported-payload-type` are
    // deliberately not deduped.
    //
    // The site that took the first reference keeps its inline copy. Only
    // that site holds it, and the emitted schema is the same shape either
    // way, so the document stays correct. Converting it after the fact is
    // not possible: a property that adds its own documentation or validation
    // spreads the shape into a fresh object (see `withPropertyDocs`), so
    // that site holds a copy rather than the cached object.
    const inlinedShape = this.inlinedShapes.get(type);
    if (inlinedShape !== undefined) {
      this.inlinedShapes.delete(type);
      const promotedKey = this.keyRegistry.keyFor(type);
      this.declaredTypes.set(type, promotedKey);
      this.declaredSchemas.set(promotedKey, inlinedShape);
      return refFor(promotedKey);
    }
    // The name is asked of `SchemaKeyRegistry`, which memoizes it, so the
    // registration that follows reuses this same computation instead of
    // walking the template argument chain a second time.
    if (this.keyRegistry.nameFor(type) !== undefined) {
      return this.registerNamed(type, build);
    }
    if (this.building.has(type)) {
      this.selfReferencingInlines.add(type);
      return refFor(this.keyRegistry.keyFor(type));
    }
    this.building.add(type);
    let inlined: SchemaObject;
    try {
      inlined = build();
    } catch (error) {
      // A self-reference reached while `build` was running claimed this
      // type's fallback key from `keyRegistry` (see the branch above). The
      // build then failed, so nothing will ever be registered under that
      // key. Release it, exactly as `registerNamed` does in its own `catch`,
      // so a retry or another reference does not resolve to a `$ref`
      // pointing at a component that never exists.
      this.keyRegistry.release(type);
      this.selfReferencingInlines.delete(type);
      throw error;
    } finally {
      this.building.delete(type);
    }
    if (!this.selfReferencingInlines.has(type)) {
      this.inlinedShapes.set(type, inlined);
      return inlined;
    }
    // Register the shape already in hand instead of rebuilding it. See this
    // method's doc comment: a second `build` would report every diagnostic
    // of the first one again.
    const key = this.keyRegistry.keyFor(type);
    this.declaredTypes.set(type, key);
    this.declaredSchemas.set(key, inlined);
    return refFor(key);
  }

  /**
   * Builds the schema for an anonymous (unnamed) `Model` or `Union`, guarded
   * against a self-referencing cycle.
   * An anonymous type has no `components.schemas` key, so it always inlines
   * instead of going through `registerNamed`'s `$ref`-and-cache path. That
   * path is also where the `building` Set's circular-reference guard lives.
   * An anonymous type on its own bypassed that guard entirely.
   * A named model can only reference itself indirectly, through a property.
   * A named model requires a name. But TypeSpec's `alias` construct can
   * still produce a self-referencing anonymous `Model`, for example
   * `alias Foo = { a: Foo };`. `alias` only expands its right-hand side; it
   * does not need or create a name for it. Building that shape recurses
   * forever and crashes with a stack overflow, since there is no cached
   * `$ref` to return once the cycle is detected.
   * A plain (non-`$ref`) schema cannot express a self-referencing cycle at
   * all: expanding one more level always leaves another self-reference
   * behind. So this guard cannot return a correct expansion once a cycle is
   * detected. It reports `unrepresentable-circular-reference` and degrades
   * to `{}` instead, matching how `unsupported-payload-type` degrades an
   * unrepresentable case elsewhere in this class.
   */
  private buildAnonymousGuarded(type: Model | Union, build: () => SchemaObject): SchemaObject {
    if (this.building.has(type)) {
      reportDiagnostic(this.program, {
        code: "unrepresentable-circular-reference",
        target: type,
      });
      return {};
    }
    this.building.add(type);
    try {
      return build();
    } finally {
      this.building.delete(type);
    }
  }

  /**
   * Registers `type` under a fresh `components.schemas` key on first use.
   * Returns a `$ref` to it.
   * `build` computes the schema body.
   * A repeat call for the same type returns the same `$ref` without
   * recomputing. This includes a call reached while `build` for it is
   * still running, that is, a circular reference.
   * Every named declaration kind, model, enum, or named union, shares this
   * one method. So the register/$ref/circular-guard logic lives in exactly
   * one place.
   */
  private registerNamed(type: Model | Enum | Union, build: () => SchemaObject): ReferenceObject {
    const key = this.keyRegistry.keyFor(type);
    if (this.declaredTypes.has(type) || this.building.has(type)) {
      return refFor(key);
    }
    this.building.add(type);
    try {
      const value = build();
      this.declaredTypes.set(type, key);
      this.declaredSchemas.set(key, value);
    } catch (error) {
      // `build()` failed. Release the key this type claimed. Otherwise, a
      // retry, or another reference to the same type, would see
      // `this.building` no longer containing it and no declaration present,
      // and return a `$ref` pointing at a component that will never exist.
      this.keyRegistry.release(type);
      throw error;
    } finally {
      this.building.delete(type);
    }
    return refFor(key);
  }

  private buildEnumSchema(type: Enum): ReferenceObject {
    return this.registerNamed(type, () =>
      withDocs(this.program, type, buildEnumSchemaBody(type), this.diagnosedTargets),
    );
  }

  private buildUnionSchema(type: Union): SchemaObject | ReferenceObject {
    if (isUninstantiatedTemplateDeclaration(type)) {
      return {};
    }
    const build = () =>
      withDocs(this.program, type, this.buildUnionSchemaBody(type), this.diagnosedTargets);
    if (type.name === undefined) {
      return this.buildAnonymousGuarded(type, build);
    }
    return this.buildNamedDeclaration(type, build);
  }

  /**
   * A union of only string literals, such as `"a" | "b"`, collapses to the
   * same `{ type: "string", enum: [...] }` shape a `string`-valued enum
   * gets. This gives one code path for "a closed set of string values", the
   * same way `buildSchema` already handles a lone string literal.
   * Any other union, including `T | null`, falls through to `anyOf` (or
   * `oneOf`, see below), one member per variant. JSON Schema, unlike OpenAPI
   * 3.0's `nullable`, has no separate nullability keyword. So `T | null`
   * becomes `anyOf: [T, { type: "null" }]` by default.
   *
   * `@oneOf` on the union switches the keyword from `anyOf` to `oneOf`,
   * keeping the same variant-schema array. `oneOf` requires exactly one
   * variant to match, rather than `anyOf`'s "at least one". This is opt-in;
   * a union with no `@oneOf` keeps emitting `anyOf` exactly as before.
   * An empty union has no variant to be. Like `never`/`void` in
   * `buildIntrinsicSchema`, it returns `{ not: {} }`, meaning nothing is
   * valid, rather than `{}`, meaning anything is valid. `anyOf: []` would be
   * the literally correct encoding of "no variant", but it is not a valid
   * draft-07 schema.
   *
   * Each `anyOf` branch is passed through `withPropertyDocs`. This keeps a
   * variant's own `@doc`/`@summary`/`@example` from being silently dropped.
   * This is legal directly on a `UnionVariant`; see `decorators.tsp`. It
   * gets the same merge/`allOf`-wrap behavior a model property's
   * documentation already gets.
   * The string-literal-collapsing branch above stays untouched. It already
   * discards individual variants in favor of one shared `enum`, so there is
   * no single variant left to hang per-branch documentation off of.
   */
  private buildUnionSchemaBody(type: Union): SchemaObject {
    const variants = [...type.variants.values()];
    if (variants.length === 0) {
      return { not: {} };
    }
    if (variants.every((variant) => variant.type.kind === "String")) {
      return {
        type: JSON_SCHEMA_TYPE.string,
        enum: [...new Set(variants.map((variant) => (variant.type as StringLiteral).value))],
      };
    }
    const variantSchemas = variants.map((variant) =>
      withPropertyDocs(
        this.program,
        variant,
        this.buildSchema(variant.type),
        this.diagnosedTargets,
      ),
    );
    return isOneOf(this.program, type) ? { oneOf: variantSchemas } : { anyOf: variantSchemas };
  }

  /**
   * Builds the `array`/`object` shape for a model backed by the built-in
   * `Array`/`Record` template. This covers `string[]`, `Record<int32>`, or
   * a named alias declared with `is`.
   * Returns `undefined` when `model` is neither.
   * This method is shared by both the anonymous-use-site early return and
   * the named-alias path, so the two can never drift apart.
   */
  private buildCollectionSchema(model: Model): SchemaObject | undefined {
    if (isArrayModelType(model)) {
      return { type: JSON_SCHEMA_TYPE.array, items: this.buildSchema(model.indexer.value) };
    }
    if (isRecordModelType(model)) {
      return {
        type: JSON_SCHEMA_TYPE.object,
        additionalProperties: this.buildSchema(model.indexer.value),
      };
    }
    return undefined;
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
   * shape. An `own` that is always the bare `{type:"object"}` sibling would
   * otherwise sit next to a `type:"array"` branch under `allOf`'s implicit
   * AND, making the schema unsatisfiable by any value.
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
   * same omit-unnecessary-nesting convention this method already applies
   * to the `ownIsEmpty` cases above.
   */
  private applyExtends(model: Model, own: SchemaObject): SchemaObject {
    if (model.baseModel === undefined) {
      return own;
    }
    // An overriding property whose `@encodedName` differs from the
    // same-named ancestor property's makes the usual
    // `{ allOf: [{ $ref: Base }, own] }` shape unsatisfiable. See
    // `findEncodedNameOverrideConflict`'s doc comment. The base branch
    // would still require the ancestor's wire name, while `own` requires
    // the override's. A real payload can only ever carry one of the two.
    // This is detected here, before any of the collection/named-base
    // branching below. It can only arise from a named, property-bearing,
    // ancestor. An array base can never have a conflicting property;
    // TypeSpec's own `no-array-properties` rule forbids declaring
    // properties on top of one. So this check never affects the
    // array-base branches.
    const conflict = findEncodedNameOverrideConflict(this.program, model);
    if (conflict !== undefined) {
      reportDiagnostic(this.program, {
        code: "encoded-name-override-conflict",
        target: model,
        format: { property: conflict.property.name, reason: conflict.reason },
      });
      return this.buildFlattenedObjectSchema(model);
    }
    // A `never`-typed override of an inherited property means that
    // property does not exist on `model` (see `isNeverTypedProperty`). But
    // `own` never consults the base's properties. So the usual
    // `{ allOf: [{ $ref: Base }, own] }` shape would still require it via
    // the `$ref` branch.
    // Flatten instead, the same fallback and reasoning as the encoded-name
    // conflict above. `buildFlattenedObjectSchema` walks
    // `walkPropertiesInherited`. That walk both gives the `never` override
    // precedence over the ancestor's definition, and already skips
    // `never`-typed properties entirely.
    const neverOverride = findNeverOverrideOfInheritedProperty(model);
    if (neverOverride !== undefined) {
      reportDiagnostic(this.program, {
        code: "never-typed-property-override",
        target: model,
        format: { property: neverOverride.name },
      });
      return this.buildFlattenedObjectSchema(model);
    }
    const ownKeys = Object.keys(own);
    const ownIsEmpty = ownKeys.length === 1 && ownKeys[0] === "type";
    const baseCollection = this.buildCollectionSchema(model.baseModel);
    if (baseCollection !== undefined) {
      const isAnonymous = isBuiltinCollectionInstantiation(model.baseModel);
      if (ownIsEmpty) {
        // See the doc comment above. `own` is guaranteed empty here. So a
        // single-branch `allOf`, or the bare collection shape for an
        // anonymous base, cannot produce a contradictory sibling `type`.
        if (isAnonymous) {
          return baseCollection;
        }
        return { allOf: [this.buildSchema(model.baseModel)] };
      }
      if (isAnonymous) {
        return { ...baseCollection, ...own };
      }
      return { allOf: [this.buildSchema(model.baseModel), own] };
    }
    const base = this.buildSchema(model.baseModel);
    if (ownIsEmpty) {
      return { allOf: [base] };
    }
    return { allOf: [base, own] };
  }

  /**
   * Applies `@discriminator` to the fully-assembled `schema` for `model`.
   * This is the older, `extends`-chain-based discriminator decorator.
   * AsyncAPI 3.x's Schema Object represents it as a bare string naming the
   * discriminating property. This differs from OpenAPI 3.0's
   * `{ propertyName, mapping }` object.
   *
   * AsyncAPI 3.x, via draft-07, requires the discriminating property to
   * meet two conditions. It must actually be defined on this schema, and it
   * must be in `required`. Emitting `discriminator` for a property that
   * fails either check would produce a schema naming a property no reader
   * could find. That is worse than omitting the keyword. Both checks are
   * reported as a diagnostic, rather than silently dropped, since
   * `@typespec/compiler` itself never validates this.
   *
   * `@discriminator("x")` names the property by its **TypeSpec** declaration
   * name, not its wire name. `getDiscriminator`'s `propertyName` is exactly
   * what appears in the TypeSpec source, before any `@encodedName` remap.
   * The property is looked up by `p.name` accordingly. Only once it is
   * found is its wire name computed, via `resolveEncodedName`, and written
   * into `schema.discriminator`. That is the key that actually appears
   * under `properties`/`required` (see `buildObjectSchema`).
   * Matching wire name against `discriminator.propertyName`, as an earlier
   * version of this method did, silently breaks the moment the
   * discriminating property has its own `@encodedName`.
   *
   * The lookup walks `model`'s inherited chain, via
   * `findDiscriminatingProperty`, rather than only `model.properties`. For
   * a derived model, the assembled `schema` is
   * `{ allOf: [{ $ref: Base }, own] }`. The discriminating property may
   * live on `Base` rather than on `model` itself. The presence check must
   * agree with the schema it is actually checking.
   *
   * This method uses a deliberate lenient interpretation. When the
   * discriminating property is found only on an ancestor (`Base` above),
   * this method still writes `discriminator` onto `schema`, even though
   * `schema` itself, as opposed to the assembled
   * `{ allOf: [{ $ref: Base }, own] }`, has no own `properties`/`required`
   * naming it.
   * AsyncAPI 3.x's Schema Object text says the property "MUST be defined at
   * this schema and ... in the required property list". Read literally,
   * that would require copying the ancestor's property definition into
   * `own` on every discriminated subtype.
   * This is intentionally not done. A `discriminator` is read after
   * resolving `allOf`; every validator and codegen this project has
   * checked against does so. So a property defined in an `allOf` branch
   * reachable via `$ref` is, in practice, "defined at this schema".
   * Copying it into every subtype's `own` would duplicate the property's
   * definition, in the base and every subtype, kept in sync by hand, for
   * no behavioral gain. It would also fight the same omit-duplication
   * principle `applyExtends` already follows: `own` excludes inherited
   * members precisely so they are not double-counted against the base's
   * `$ref`.
   * Do not "fix" this by re-declaring the property in `own`. That is the
   * discussed and rejected alternative, not an oversight.
   */
  private applyDiscriminator(model: Model, schema: SchemaObject): SchemaObject {
    const discriminator = getDiscriminator(this.program, model);
    if (discriminator === undefined) {
      return schema;
    }
    const prop = findDiscriminatingProperty(model, discriminator.propertyName);
    if (prop === undefined) {
      reportDiagnostic(this.program, {
        code: "missing-discriminator-property",
        target: model,
        format: { property: discriminator.propertyName },
      });
      return schema;
    }
    if (prop.optional) {
      reportDiagnostic(this.program, {
        code: "optional-discriminator-property",
        target: model,
        format: { property: discriminator.propertyName },
      });
      return schema;
    }
    const wireName = resolveEncodedName(this.program, prop, SCHEMA_ENCODING_MIME_TYPE);
    return { ...schema, discriminator: wireName };
  }

  /** Builds the `object` shape for a plain (non-collection) model. */
  private buildObjectSchema(model: Model): SchemaObject {
    return this.buildObjectSchemaFromProperties(model.properties.values());
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
   * `{ allOf: [{ $ref: Base }, own] }` shape would then key the base branch
   * and the own branch by two different wire names for the same conceptual
   * property. That would make the assembled schema reject every valid
   * payload.
   */
  private buildFlattenedObjectSchema(model: Model): SchemaObject {
    const schema = this.buildObjectSchemaFromProperties(walkPropertiesInherited(model));
    // The flattened shape has no `$ref`/`allOf` back to any ancestor.
    // So an indexer constraint, `additionalProperties`, declared on
    // `model` itself or inherited from a `baseModel`, would otherwise be
    // silently dropped. Walk the chain, mirroring how the compiler itself
    // resolves an inherited indexer, for the nearest one, and merge it in.
    for (
      let current: Model | undefined = model;
      current !== undefined;
      current = current.baseModel
    ) {
      const collection = this.buildCollectionSchema(current);
      if (collection !== undefined) {
        return { ...collection, ...schema };
      }
    }
    return schema;
  }

  /**
   * Shared body of `buildObjectSchema` and `buildFlattenedObjectSchema`.
   * Builds the `object` shape, `properties`/`required`, omit-empty, from
   * whichever set of properties the caller hands it.
   * The caller hands it a model's own declared properties for the normal,
   * non-conflicting case. It hands the fully `baseModel`-flattened set for
   * the encoded-name-override-conflict fallback.
   */
  private buildObjectSchemaFromProperties(properties: Iterable<ModelProperty>): SchemaObject {
    const propertySchemas: Record<string, SchemaObject | ReferenceObject> = Object.create(
      null,
    ) as Record<string, SchemaObject | ReferenceObject>;
    const required: string[] = [];
    // Guards against a wire-name collision between two *distinct* TypeSpec
    // properties. This excludes one property overriding another of the
    // same TypeSpec name; `walkPropertiesInherited`'s own by-name dedup
    // already collapses that case to a single yielded property.
    // This collision can only arise via the `buildFlattenedObjectSchema`
    // fallback `applyExtends` uses for
    // `findEncodedNameOverrideConflict`'s "different name, same wire name"
    // case. `walkPropertiesInherited` yields the more-derived model's own
    // property first. So the first property to claim a given wire name
    // here is always the most-derived one, matching the override
    // precedence the rest of this codebase already gives same-named
    // overrides.
    // Without this guard, a later, less-derived, property with the same
    // wire name would silently overwrite `propertySchemas` and push a
    // duplicate entry onto `required`.
    const claimedWireNames = new Set<string>();

    for (const prop of properties) {
      // A never-typed property means "this property does not exist".
      // Examples include a template default `model Env<T = never> { data:
      // T; }` instantiated as `Env` with no type argument, or a direct
      // `x: never` declaration.
      // Emitting it, let alone requiring it, would make the schema
      // unsatisfiable. Skip it entirely. Standalone `never` still maps to
      // `{ not: {} }`.
      if (isNeverTypedProperty(prop)) {
        continue;
      }
      // The compiler's own example serializer, `serializeValueAsJson`, used
      // by `buildDocFields` below, resolves each nested object property
      // name through `@encodedName` for `SCHEMA_ENCODING_MIME_TYPE`.
      // The schema's own property key must match it. Otherwise, a
      // model-level or property-level `@example` naming this property by
      // its wire name would fail validation against `required`/`properties`
      // here.
      const wireName = resolveEncodedName(this.program, prop, SCHEMA_ENCODING_MIME_TYPE);
      if (claimedWireNames.has(wireName)) {
        continue;
      }
      claimedWireNames.add(wireName);
      propertySchemas[wireName] = withPropertyDocs(
        this.program,
        prop,
        this.buildSchema(prop.type),
        this.diagnosedTargets,
      );
      if (!prop.optional) {
        required.push(wireName);
      }
    }

    const schema: SchemaObject = { type: JSON_SCHEMA_TYPE.object };
    // Omit empty fields instead of emitting `properties: {}`. This is the
    // same omit-empty convention `required` follows below.
    if (Object.keys(propertySchemas).length > 0) {
      schema.properties = propertySchemas;
    }
    if (required.length > 0) {
      schema.required = required;
    }
    return schema;
  }

  private buildScalarSchema(scalar: Scalar): SchemaObject {
    // TypeSpec's own built-in scalars, such as `string` and `int32`, carry
    // their own standard-library doc comments. For example, `string` has "A
    // sequence of textual characters." Surfacing those on every plain
    // `string`/`int32` field would flood the output. So only a
    // user-declared scalar's own documentation is applied here.
    // `buildScalarSchemaShapeWithDocs` walks the whole `baseScalar` chain.
    // This keeps documentation on an intermediate or base user scalar from
    // being lost when the use site is derived through more than one level.
    // For example, `scalar WorkEmail extends Email;` where only `Email`
    // itself carries `@doc`/`@summary`/`@example`.
    return this.buildScalarSchemaShapeWithDocs(scalar);
  }

  /**
   * Builds the `type`/`format` shape for `scalar`, merged with
   * documentation collected along the entire `baseScalar` chain.
   * The base's own docs are applied first. Then each more-derived level's
   * own `@summary`/`@doc`/`@example` overrides them. `withDocs`'s
   * object-spread semantics already give the more specific fields priority
   * when merged last.
   * Built-in scalars never contribute documentation, only the shape. See
   * `isBuiltinScalar` at the `buildScalarSchema` call site's doc comment.
   * This method bottoms out at the first built-in ancestor found, or at the
   * unconstrained `{}` shape for an unmapped root scalar. It then merges
   * each user-declared level's docs back on the way up.
   * `withPropertyDocs` on the use site can still override with the
   * property's own documentation afterward.
   */
  private buildScalarSchemaShapeWithDocs(scalar: Scalar): SchemaObject {
    if (isBuiltinScalar(scalar)) {
      const shape = Object.hasOwn(SCALAR_SCHEMAS, scalar.name)
        ? { ...SCALAR_SCHEMAS[scalar.name] }
        : {};
      // Built-ins never contribute *documentation* (see this method's own
      // doc comment). But an augment decorator, such as
      // `@@minLength(TypeSpec.string, 3);`, is the only legal way to apply
      // a 2.8 validation decorator to a built-in scalar. It is real user
      // intent, not library noise. So it must still be read back here,
      // rather than silently discarded.
      return { ...shape, ...buildValidationKeywords(this.program, scalar, this.diagnosedTargets) };
    }
    // This is a derived, user-declared scalar. Start from its base
    // scalar's shape, recursing all the way to a built-in ancestor, or to
    // `{}` for an unmapped root scalar. Then merge this level's own
    // documentation on top.
    //
    // A validation keyword this level re-declares that the base already
    // baked in must NOT simply replace the base's value the way plain
    // object-spread would. For example, `@minLength(2) scalar Loose
    // extends Tight;` where `Tight` already has `@minLength(5)`. Two
    // constraints on the same value form a JSON Schema intersection; both
    // must hold. This is the same as the property-vs-scalar collision
    // `withPropertyDocs` guards against. Otherwise, a more-derived scalar
    // could silently erase a stricter ancestor constraint with no
    // diagnostic.
    // On collision, `base` is wrapped whole in `allOf`, the same wrap
    // `withPropertyDocs` uses, so both levels' keywords hold
    // simultaneously. Otherwise, keywords are merged in directly as before.
    const base = scalar.baseScalar ? this.buildScalarSchemaShapeWithDocs(scalar.baseScalar) : {};
    return withDocs(this.program, scalar, base, this.diagnosedTargets);
  }
}
