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
  getDiscriminatedUnion,
  ignoreDiagnostics,
} from "@typespec/compiler";
import { SchemaObject, ReferenceObject } from "../types/index.js";
import { reportDiagnostic } from "../lib.js";
import { isOneOf } from "../decorators/index.js";
import { JSON_SCHEMA_TYPE, SCHEMA_ENCODING_MIME_TYPE } from "../constants.js";
import { refFor, isUninstantiatedTemplateDeclaration } from "../naming.js";
import { SchemaDiagnostics } from "./schemas/diagnostics.js";
import { DeclarationRegistry } from "./schemas/declarations.js";
import {
  findDiscriminatingProperty,
  findEncodedNameOverrideConflict,
  findNeverOverrideOfInheritedProperty,
} from "./schemas/inheritance.js";
import { withDocs, withPropertyDocs, buildValidationKeywords } from "./schemas/annotations.js";
import {
  isBuiltinScalar,
  isBuiltinCollectionInstantiation,
  isNeverTypedProperty,
  buildIntrinsicSchema,
  buildEnumSchemaBody,
  buildEnumMemberSchema,
  SCALAR_SCHEMAS,
} from "./schemas/scalars.js";
import { applyEncoding } from "./schemas/encoding.js";
import { shouldEmitProperty } from "./schemas/visibility.js";

/**
 * Builder for converting TypeSpec types to AsyncAPI Schema Objects.
 */
export class SchemaBuilder {
  private readonly declarations: DeclarationRegistry;

  public constructor(private readonly program: Program) {
    this.declarations = new DeclarationRegistry(program);
    this.diagnostics = new SchemaDiagnostics(program);
  }

  public getSchemas(): Record<string, SchemaObject> {
    this.flushPendingSubtypes();
    const schemas: Record<string, SchemaObject> = Object.create(null) as Record<
      string,
      SchemaObject
    >;
    for (const [key, value] of this.declarations.entries()) {
      schemas[key] = value;
    }
    return schemas;
  }

  /**
   * Returns the type that owns the `components.schemas` key `key`, or
   * `undefined` when no type claimed it.
   * The message builder uses this to detect a `components.messages` key that
   * names another type's schema.
   */
  public schemaKeyOwner(key: string): Type | undefined {
    return this.declarations.keyOwner(key);
  }

  /**
   * Returns the `components.schemas` key `model` would claim, without
   * registering it and without building anything.
   * The message builder uses this to tell two models apart. Two models that
   * share this key emit one component, so they are the same declaration as
   * far as the document is concerned.
   */
  public schemaKeyCandidate(model: Model): string {
    return this.declarations.keyCandidate(model);
  }

  /**
   * Builds the payload schema of a message that lifts `@header` fields.
   *
   * The lifted fields belong to the message's `headers`, so its payload
   * must not describe them. Removing them from the model's own component
   * would be wrong: that component is shared, and every other reader of the
   * model still expects the whole shape. A subtype, another message's
   * field, and a cycle back into the same graph all read it.
   *
   * So the payload gets a component of its own, keyed after the model's,
   * and the model's component keeps every field. The key goes through
   * `claimDerived`, so a model the author named after the derived key is
   * reported rather than silently replaced.
   *
   * The body is flattened rather than composed with `allOf`. A lifted field
   * can be inherited, and an `allOf` branch pointing at the base would
   * bring it straight back.
   *
   * The payload component is a declaration of the model, so it gets most of
   * what a declaration of the model gets. It carries the model's
   * documentation, and it runs the model's own inheritance checks. Nothing
   * else need read the model, in which case the model's own component is
   * never built and this is the only place those things can happen. The one
   * thing the payload never carries is `@discriminator`. See
   * `buildPayloadShape` and `declareDiscriminatedHierarchy`.
   *
   * @param model - The message model
   * @param omitted - The fields that moved to `headers`
   * @returns A reference to the payload component
   */
  public buildPayloadDeclaration(
    model: Model,
    omitted: ReadonlySet<ModelProperty>,
  ): SchemaObject | ReferenceObject {
    if (omitted.size === 0) {
      return this.buildDeclarationRef(model);
    }

    const baseKey = this.declarations.keyFor(model);
    const payloadKey = `${baseKey}Payload`;
    if (!this.declarations.claimDerived(payloadKey, model)) {
      // The clash is reported. The payload shape is emitted in place instead.
      // A reference to the model's own component would describe the lifted
      // fields as payload data, so the message would contradict its own
      // `headers` on top of the reported clash.
      return this.buildPayloadShape(model, omitted);
    }

    this.declarations.setSchema(payloadKey, this.buildPayloadShape(model, omitted));
    return refFor(payloadKey);
  }

  /**
   * Builds the body of a payload component.
   *
   * This runs the same tail `buildModelSchema` runs for a declaration of
   * `model`, and it applies the model's documentation. It runs the
   * inheritance checks of `applyExtends` too, because the flattening below
   * silently repairs the shapes those checks are about.
   *
   * The model's own component may never be built. That happens when no
   * other reader of the model exists. So none of this can be left to it.
   * Both components can also be built for one model. Every diagnostic here
   * reports once per model, so the user sees one mistake once.
   *
   * The payload never carries `discriminator`. See
   * `declareDiscriminatedHierarchy`.
   */
  private buildPayloadShape(model: Model, omitted: ReadonlySet<ModelProperty>): SchemaObject {
    this.reportInheritanceConflicts(model);
    this.declareDiscriminatedHierarchy(model);
    const shape = this.buildFlattenedObjectSchema(model, omitted);
    return withDocs(this.program, model, shape, this.diagnostics);
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
  private declareDiscriminatedHierarchy(model: Model): void {
    for (
      let ancestor: Model | undefined = model.baseModel;
      ancestor !== undefined;
      ancestor = ancestor.baseModel
    ) {
      if (getDiscriminator(this.program, ancestor) !== undefined) {
        this.buildDeclarationRef(ancestor);
      }
    }
    // `applyDiscriminator` decides whether the keyword applies at all. It
    // reports a missing or optional discriminating property and drops the
    // keyword, and that is not this conflict. So its answer is what tells
    // the two apart, and the result it built is discarded.
    if (this.applyDiscriminator(model, {}).discriminator === undefined) {
      return;
    }
    reportDiagnostic(this.program, {
      code: "discriminated-lifted-header",
      target: model,
      format: { name: model.name },
    });
    this.buildDeclarationRef(model);
  }

  /**
   * Builds `model` as a `components.schemas` declaration and returns a `$ref`
   * to it.
   * `buildSchema` prefers to inline a named declaration that has no compact
   * composed name. That preference is right for a property use site. It is
   * wrong for a top-level declaration such as a `@message` payload. Inlining
   * there copies the whole body into the message, and a second reference to
   * the same declaration registers it as a component too. The same type then
   * appears in two places that can silently diverge.
   * This entry point turns the preference off for `model`, so the declaration
   * always registers, under its fallback key when it has no compact one.
   * A declaration that already inlined at an earlier use site is promoted to a
   * component here, the same way a second reference promotes it.
   */
  public buildDeclarationRef(model: Model): SchemaObject | ReferenceObject {
    this.declarations.force(model);
    return this.buildSchema(model);
  }

  /**
   * Builds one `object` schema out of `properties`, with no declaration and
   * no `$ref`.
   * The message builder uses it for a `headers` schema assembled from the
   * fields `@header` marks. Those fields have no model of their own to build
   * from; they are a hand-picked subset of the message model's fields.
   * The caller hands in exactly the properties it wants described. For the
   * headers schema those are the very properties the payload component of
   * that message leaves out.
   */
  public buildPropertiesSchema(properties: Iterable<ModelProperty>): SchemaObject {
    return this.buildObjectSchemaFromProperties(properties);
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
        // This is deliberately not deduped through `diagnostics`, unlike
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

  // Dedupes diagnostics that this builder would otherwise report more than
  // once for one mistake. See `SchemaDiagnostics` for the two ways a repeat
  // arises. The ledger belongs to this instance, so it covers one emit.
  private readonly diagnostics: SchemaDiagnostics;

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
      return withDocs(this.program, model, this.applyDiscriminator(model, shape), this.diagnostics);
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
      return this.declarations.guardAnonymous(model, build);
    }
    return this.declarations.declareNamed(model, build);
  }

  /**
   * Builds every queued discriminated subtype, and claims their schema keys.
   * `getSchemas` runs it, so a caller that only wants the schemas never has
   * to. A caller that inspects the claimed keys before the document is
   * assembled runs it itself, so it sees the final key set. Running it twice
   * is harmless; the queue is drained each time.
   *
   * A subtype is not reachable by walking properties. Only the `extends`
   * link points at it, and that link points the other way. So a
   * `@discriminator` base would otherwise emit a schema that advertises a
   * polymorphic payload while describing none of its variants.
   * Each subtype registers as a component rather than inlining. A subtype
   * that inlined would land nowhere, because no property references it.
   * Building a subtype can queue more subtypes, so the loop runs until the
   * queue is empty. An uninstantiated template declaration is skipped: its
   * properties are bare template parameters with no real shape.
   */
  public flushPendingSubtypes(): void {
    for (
      let subtype = this.declarations.nextPendingSubtype();
      subtype !== undefined;
      subtype = this.declarations.nextPendingSubtype()
    ) {
      if (isUninstantiatedTemplateDeclaration(subtype)) {
        continue;
      }
      this.buildDeclarationRef(subtype);
    }
  }

  private buildEnumSchema(type: Enum): ReferenceObject {
    return this.declarations.register(type, () =>
      withDocs(this.program, type, buildEnumSchemaBody(type), this.diagnostics),
    );
  }

  private buildUnionSchema(type: Union): SchemaObject | ReferenceObject {
    if (isUninstantiatedTemplateDeclaration(type)) {
      return {};
    }
    const build = () =>
      withDocs(this.program, type, this.buildUnionSchemaBody(type), this.diagnostics);
    if (type.name === undefined) {
      return this.declarations.guardAnonymous(type, build);
    }
    return this.declarations.declareNamed(type, build);
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
    const discriminated = this.buildDiscriminatedUnionBody(type);
    if (discriminated !== undefined) {
      return discriminated;
    }
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
      withPropertyDocs(this.program, variant, this.buildSchema(variant.type), this.diagnostics),
    );
    return isOneOf(this.program, type) ? { oneOf: variantSchemas } : { anyOf: variantSchemas };
  }

  /**
   * Builds the body of a `@discriminated` union, or returns `undefined` when
   * `type` does not carry the decorator.
   *
   * `@discriminated` states how the union travels, not only what it can hold.
   * The default `envelope: "object"` wraps every variant in a two-property
   * object: one property naming the variant, one holding it. So
   * `@discriminated union Pet { cat: Cat, dog: Dog }` puts
   * `{ "kind": "cat", "value": { ... } }` on the wire, not a bare `Cat`.
   * Emitting the variants as a plain union would describe a shape one level
   * flatter than the one that actually travels, and every real message would
   * fail to validate against it.
   *
   * `envelope: "none"` puts the discriminating property inside each variant
   * instead, so the variants are referenced directly.
   *
   * Each envelope is written inline rather than registered as its own named
   * component. The official emitter synthesizes a model per variant, named by
   * concatenating the union and variant names, and that synthesized name can
   * collide with a name the user already declared. An inline envelope has no
   * name to collide with. Nothing else refers to these shapes, so there is
   * nothing for a component entry to save.
   *
   * `discriminator` is the bare property-name string AsyncAPI defines, the
   * same spelling the model-level `@discriminator` already emits.
   */
  private buildDiscriminatedUnionBody(type: Union): SchemaObject | undefined {
    // The diagnostics this reports are the decorator's own validation, such
    // as a variant that is not a model. The compiler already surfaces them
    // from the checker, so re-reporting them here would double every message.
    const discriminated = ignoreDiagnostics(getDiscriminatedUnion(this.program, type));
    if (discriminated === undefined) {
      return undefined;
    }
    const { discriminatorPropertyName, envelopePropertyName, envelope } = discriminated.options;
    const variants = [...discriminated.variants.entries()];
    const branches = variants.map(([variantName, variantType]) => {
      const variantSchema = this.buildSchema(variantType);
      if (envelope === "none") {
        return variantSchema;
      }
      return {
        type: JSON_SCHEMA_TYPE.object,
        properties: {
          [discriminatorPropertyName]: {
            type: JSON_SCHEMA_TYPE.string,
            enum: [variantName],
          },
          [envelopePropertyName]: variantSchema,
        },
        required: [discriminatorPropertyName, envelopePropertyName],
      } satisfies SchemaObject;
    });
    return {
      type: JSON_SCHEMA_TYPE.object,
      // `oneOf`, not `anyOf`: the discriminating property makes exactly one
      // branch match, and saying so lets a validator report which one failed.
      oneOf: branches,
      discriminator: discriminatorPropertyName,
    };
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
    if (this.reportInheritanceConflicts(model)) {
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
  private reportInheritanceConflicts(model: Model): boolean {
    if (model.baseModel === undefined) {
      return false;
    }
    const conflict = findEncodedNameOverrideConflict(this.program, model);
    if (conflict !== undefined) {
      this.reportModelDiagnosticOnce(model, "encoded-name-override-conflict", {
        property: conflict.property.name,
        reason: conflict.reason,
      });
      return true;
    }
    const neverOverride = findNeverOverrideOfInheritedProperty(model);
    if (neverOverride !== undefined) {
      this.reportModelDiagnosticOnce(model, "never-typed-property-override", {
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
   * the message names no component, so a second report would put the same
   * text on the same squiggle.
   *
   * The record lives in `diagnostics`, so it is scoped to one builder and
   * one emit.
   */
  private reportModelDiagnosticOnce(
    model: Model,
    code:
      | "encoded-name-override-conflict"
      | "never-typed-property-override"
      | "missing-discriminator-property"
      | "optional-discriminator-property",
    format: Record<string, string>,
  ): void {
    this.diagnostics.reportOnce({ code, target: model, format });
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
      this.reportModelDiagnosticOnce(model, "missing-discriminator-property", {
        property: discriminator.propertyName,
      });
      return schema;
    }
    if (prop.optional) {
      this.reportModelDiagnosticOnce(model, "optional-discriminator-property", {
        property: discriminator.propertyName,
      });
      return schema;
    }
    // The emitted schema now advertises a polymorphic payload. Its variants
    // must be present in `components.schemas` for that to mean anything. The
    // subtypes are queued rather than built here, so this model's own entry
    // lands first. See `flushPendingSubtypes`.
    // Nothing is queued when the checks above dropped `discriminator`. The
    // emitted schema then advertises no polymorphism, so a subtype that no
    // message reaches stays out of the document.
    this.declarations.queueSubtypes(model);
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
   * `buildPayloadShape` uses it for the payload component of a message that
   * lifts `@header` fields, and hands in those fields as `omitted`. That
   * payload must flatten for a reason of its own. A lifted field can be
   * inherited, and an `allOf` branch to the base would bring it back.
   *
   * @param model - The model to flatten
   * @param omitted - Properties to leave out of the result
   */
  private buildFlattenedObjectSchema(
    model: Model,
    omitted: ReadonlySet<ModelProperty> = new Set(),
  ): SchemaObject {
    const kept = [...walkPropertiesInherited(model)].filter((property) => !omitted.has(property));
    const schema = this.buildObjectSchemaFromProperties(kept);
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
      // `@invisible` says this property is in no lifecycle phase, so it is
      // left out entirely. A partial `@visibility` is emitted in full and
      // reported, because a message has only one shape to emit it into.
      if (!shouldEmitProperty(this.program, prop, this.diagnostics)) {
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
        this.diagnostics,
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
      // `@@encode` reaches a built-in the same way, and changes the very
      // `type`/`format` this shape is made of, so it is applied first. An
      // explicit `@format` merged in afterwards still wins over the format
      // the encoding resolved to.
      return {
        ...applyEncoding(this.program, scalar, shape),
        ...buildValidationKeywords(this.program, scalar, this.diagnostics),
      };
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
    // This level's own `@encode` changes the `type`/`format` it inherited
    // from the base. It is applied before `withDocs`, so an explicit
    // `@format` on this same scalar still wins over the encoding's format.
    const base = applyEncoding(
      this.program,
      scalar,
      scalar.baseScalar ? this.buildScalarSchemaShapeWithDocs(scalar.baseScalar) : {},
    );
    return withDocs(this.program, scalar, base, this.diagnostics);
  }
}
