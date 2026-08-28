import {
  Type,
  Model,
  ModelProperty,
  Enum,
  Union,
  UnionVariant,
  Program,
  StringLiteral,
  isArrayModelType,
  isRecordModelType,
  resolveEncodedName,
  getDiscriminatedUnion,
  ignoreDiagnostics,
} from "@typespec/compiler";
import type { SchemaObject, ReferenceObject } from "../types/index.js";
import {
  reportDiagnostic,
  isOneOf,
  JSON_SCHEMA_TYPE,
  SCHEMA_ENCODING_MIME_TYPE,
  isUninstantiatedTemplateDeclaration,
} from "tsp-asyncapi-core";
import { refFor } from "./json-pointer.js";
import { SchemaDiagnostics } from "./schemas/diagnostics.js";
import { DeclarationRegistry } from "./schemas/declarations.js";
import {
  InheritanceWalk,
  applyDiscriminator,
  applyExtends,
  buildFlattenedObjectSchema,
  declareDiscriminatedHierarchy,
  reportInheritanceConflicts,
} from "./schemas/inheritance.js";
import { withDocs, withPropertyDocs } from "./schemas/annotations.js";
import {
  isBuiltinScalar,
  isBuiltinCollectionInstantiation,
  isNeverTypedProperty,
  buildIntrinsicSchema,
  buildEnumSchemaBody,
  buildEnumMemberSchema,
  buildScalarSchema,
  buildScalarShapeWithDocs,
  propertyStatesItsOwnShape,
} from "./schemas/scalars.js";
import { shouldEmitProperty } from "./schemas/visibility.js";
import { encodedUnionVariants } from "./schemas/encoding.js";

/**
 * The answer for a union whose variants are all referenced as usual. Only a
 * property carrying `@encode` names a variant to write in place.
 */
const NO_INLINED_VARIANTS: ReadonlySet<Type> = new Set();

/**
 * Builder for converting TypeSpec types to AsyncAPI Schema Objects.
 *
 * The builder dispatches on a type's kind and assembles what each kind
 * writes down: objects out of properties, collections, unions, and enums.
 * The two subjects with rules of their own live beside it. `extends` and
 * `@discriminator` are in `schemas/inheritance.ts`, and a scalar's own
 * shape is in `schemas/scalars.ts`.
 */
export class SchemaBuilder {
  private readonly declarations: DeclarationRegistry;

  /**
   * What the inheritance rules in `schemas/inheritance.ts` reach back
   * through. Built once, so the rules can be free functions without a fresh
   * object per call.
   */
  private readonly inheritance: InheritanceWalk;

  public constructor(private readonly program: Program) {
    this.declarations = new DeclarationRegistry(program);
    this.diagnostics = new SchemaDiagnostics(program);
    this.inheritance = {
      program,
      diagnostics: this.diagnostics,
      declarations: this.declarations,
      buildSchema: (type) => this.buildSchema(type),
      buildDeclarationRef: (model) => this.buildDeclarationRef(model),
      buildCollectionSchema: (model) => this.buildCollectionSchema(model),
      buildObjectSchemaFromProperties: (properties) =>
        this.buildObjectSchemaFromProperties(properties),
    };
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
   * Claims a `components.schemas` key that no type owns, on behalf of the
   * message the key was derived from.
   *
   * The raw schema survey uses this. It runs before any model is walked, so
   * asking who owns a key would always answer "nobody": the check has to be
   * a claim. Routing it through here puts a derived key under the same
   * collision rule as every other one.
   *
   * @param key - The derived key
   * @param target - The message model the key was derived from
   * @returns True when the key was free
   */
  public claimDerived(key: string, target: Model): boolean {
    return this.declarations.claimDerived(key, target, "raw");
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

    // The key the model would claim, not a claim on it. The model's own
    // component is often never built. Nothing but this message reads the
    // model, and this message describes its payload instead. Claiming the
    // key here would then reserve a key no schema is ever written under.
    // Another type that computes the same key would be reported as a
    // duplicate of a component that does not exist. Every reference to
    // that component would dangle.
    //
    // A reader that does build the model's own component claims the key
    // then.
    const baseKey = this.declarations.keyCandidate(model);
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
    reportInheritanceConflicts(this.inheritance, model);
    declareDiscriminatedHierarchy(this.inheritance, model);
    const shape = buildFlattenedObjectSchema(this.inheritance, model, omitted);
    return withDocs(this.program, model, shape, this.diagnostics);
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
        return buildScalarSchema(this.program, this.declarations, this.diagnostics, type);
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
      const shape = applyExtends(this.inheritance, model, own);
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
        applyDiscriminator(this.inheritance, model, shape),
        this.diagnostics,
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

  private buildUnionSchema(
    type: Union,
    inlined: ReadonlySet<Type> = NO_INLINED_VARIANTS,
  ): SchemaObject | ReferenceObject {
    if (isUninstantiatedTemplateDeclaration(type)) {
      return {};
    }
    const build = () =>
      withDocs(this.program, type, this.buildUnionSchemaBody(type, inlined), this.diagnostics);
    if (type.name === undefined) {
      return this.declarations.guardAnonymous(type, build);
    }
    // A named union earns a component, and that component describes the
    // union as declared. An encoded variant is written in place, so a use
    // site that encodes one cannot refer to the component: the reference
    // would describe the un-encoded shape. Such a site writes the whole
    // union in place instead.
    //
    // The build runs unguarded. A variant that names this union again
    // reaches `declareNamed` below, which registers the component and
    // answers with a reference, so the recursion ends there.
    if (inlined.size > 0) {
      return build();
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
  private buildUnionSchemaBody(type: Union, inlined: ReadonlySet<Type>): SchemaObject {
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
      withPropertyDocs(
        this.program,
        variant,
        this.buildVariantSchema(variant, inlined),
        this.diagnostics,
      ),
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
   * This is shared by both the anonymous-use-site early return and
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

  /** Builds the `object` shape for a plain (non-collection) model. */
  private buildObjectSchema(model: Model): SchemaObject {
    return this.buildObjectSchemaFromProperties(model.properties.values());
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
        this.buildPropertyTypeSchema(prop),
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

  /**
   * The schema of one property's declared type.
   *
   * A property carrying its own `@encode` rewrites the `type` and the
   * `format` of the value. A Reference Object cannot be rewritten: `allOf`
   * intersects, and two different `type`s do not intersect, they
   * contradict. So a property like that writes the scalar in place, which
   * is what every property did before a scalar earned a component.
   *
   * `@format` is the same case: a format is a draft-07 annotation, not a
   * keyword that intersects, and two different ones on a value contradict.
   * So is the prose. A property's own `@doc` fully determines what the use
   * site says, and a `$ref` cannot take the scalar's own text away — both
   * would be written, one nested inside the other.
   *
   * A validation keyword is different. `minLength` on the property and
   * `minLength` on the scalar are two constraints on one value, and both
   * holding is exactly what `allOf` means. A property that only constrains
   * still writes a reference.
   *
   * A named model is not this case either. Its annotations sit at the
   * object level rather than being its shape, so a property over one has
   * always layered its own above an `allOf`, and still does.
   *
   * A union-typed property asks `encodedUnionVariants` which variants its
   * `@encode` describes, and hands the answer to the union builder. A named
   * union that has one is written in place for the same reason a scalar is:
   * the component describes the union as declared, and a reference to it
   * would carry no encoding at all.
   */
  private buildPropertyTypeSchema(prop: ModelProperty): SchemaObject | ReferenceObject {
    if (
      prop.type.kind === "Scalar" &&
      !isBuiltinScalar(prop.type) &&
      propertyStatesItsOwnShape(this.program, prop)
    ) {
      return buildScalarShapeWithDocs(this.program, this.diagnostics, prop.type);
    }
    if (prop.type.kind === "Union") {
      return this.buildUnionSchema(prop.type, encodedUnionVariants(this.program, prop));
    }
    return this.buildSchema(prop.type);
  }

  /**
   * The schema of one union variant, referenced or written in place.
   *
   * A variant the caller named as encoded is written in place, for the same
   * reason a property carrying `@encode` writes its scalar in place. The
   * component holds the un-encoded shape, so the encoded value cannot refer
   * to it. Building the reference and then dropping it would leave a
   * component nothing points at.
   *
   * A built-in scalar has no component either way, so it takes the ordinary
   * path.
   */
  private buildVariantSchema(
    variant: UnionVariant,
    inlined: ReadonlySet<Type>,
  ): SchemaObject | ReferenceObject {
    const { type } = variant;
    if (type.kind === "Scalar" && !isBuiltinScalar(type) && inlined.has(type)) {
      return buildScalarShapeWithDocs(this.program, this.diagnostics, type);
    }
    return this.buildSchema(type);
  }
}
