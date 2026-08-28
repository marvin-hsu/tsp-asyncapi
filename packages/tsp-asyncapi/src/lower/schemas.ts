/**
 * The lower half of schema construction.
 *
 * `SchemaBuilder` dispatches on a type's kind and assembles what each kind
 * writes: objects from properties, collections, unions, and enums. `extends`
 * and `@discriminator` live in `schemas/inheritance.ts`; a scalar's own shape
 * lives in `schemas/scalars.ts`.
 */

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

/** Converts TypeSpec types to AsyncAPI Schema Objects. */
export class SchemaBuilder {
  private readonly declarations: DeclarationRegistry;

  /**
   * What the inheritance rules in `schemas/inheritance.ts` reach back
   * through, built once so those rules stay free functions.
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
   * `undefined` when no type claimed it. The message builder uses this to
   * detect a `components.messages` key that names another type's schema.
   */
  public schemaKeyOwner(key: string): Type | undefined {
    return this.declarations.keyOwner(key);
  }

  /**
   * Claims a `components.schemas` key that no type owns, on behalf of the
   * message the key was derived from.
   *
   * The raw schema survey runs before any model is walked, so it cannot ask
   * who owns a key; it can only claim one. Routing the claim through here
   * puts a derived key under the same collision rule as every other one.
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
   * A lifted field must not appear in the payload, but the model's own
   * component is shared with subtypes, other messages, and cycles, so it
   * must keep every field. The payload gets a component of its own instead,
   * keyed after the model's through `claimDerived`, which reports a
   * collision rather than silently replacing a same-named declaration.
   *
   * The body is flattened rather than composed with `allOf`, because a
   * lifted field can be inherited and an `allOf` branch pointing at the base
   * would bring it back. The payload carries the model's documentation and
   * runs its inheritance checks, since the model's own component may never
   * be built. It never carries `@discriminator`; see `buildPayloadShape`.
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

    // This reads the key the model would claim, without claiming it: the
    // model's own component is often never built, since nothing but this
    // message reads the model. Claiming it here would reserve a key no
    // schema is ever written under, and a reader that does build the
    // model's own component claims it then.
    const baseKey = this.declarations.keyCandidate(model);
    const payloadKey = `${baseKey}Payload`;
    if (!this.declarations.claimDerived(payloadKey, model)) {
      // The clash is reported, and the payload shape is emitted in place
      // instead. A reference to the model's own component would describe
      // the lifted fields as payload data, contradicting the `headers`.
      return this.buildPayloadShape(model, omitted);
    }

    this.declarations.setSchema(payloadKey, this.buildPayloadShape(model, omitted));
    return refFor(payloadKey);
  }

  /**
   * Builds the body of a payload component.
   *
   * This runs the same tail `buildModelSchema` runs for a declaration of
   * `model`, and applies the model's documentation. It also runs the
   * inheritance checks of `applyExtends`, because the flattening below
   * silently repairs the shapes those checks are about, and because the
   * model's own component may never be built otherwise.
   *
   * Both components can be built for one model, but every diagnostic here
   * reports once per model. The payload never carries `discriminator`; see
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
   *
   * `buildSchema` prefers to inline a named declaration with no compact
   * composed name, which is right at a property use site but wrong for a
   * top-level declaration such as a `@message` payload: a second reference
   * would then register the same type as a component too, so it appears in
   * two places that can silently diverge. This entry point turns that
   * preference off, so `model` always registers, under its fallback key
   * when it has no compact one. A declaration already inlined at an earlier
   * use site is promoted to a component here, same as a second reference.
   */
  public buildDeclarationRef(model: Model): SchemaObject | ReferenceObject {
    this.declarations.force(model);
    return this.buildSchema(model);
  }

  /**
   * Builds one `object` schema out of `properties`, with no declaration and
   * no `$ref`.
   *
   * The message builder uses it for a `headers` schema assembled from the
   * fields `@header` marks: a hand-picked subset of the message model's
   * fields, with no model of their own to build from. Those are the same
   * properties the message's payload component leaves out.
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
        // `enum` covers both literals and real enums with one code path;
        // `const` would be equivalent but need its own branch.
        return { type: JSON_SCHEMA_TYPE.string, enum: [type.value] };
      case "Number":
        return { type: JSON_SCHEMA_TYPE.number, enum: [type.value] };
      case "Boolean":
        return { type: JSON_SCHEMA_TYPE.boolean, enum: [type.value] };
      default:
        // `Type.kind` has more variants than this emitter handles, e.g.
        // `Interface`, `Namespace`, `Operation`. TypeScript's exhaustiveness
        // check cannot catch a missing case; the `Type` union is
        // deliberately open-ended, and a user can reach this branch by
        // naming one of those kinds where a payload/property type is
        // expected. Report it rather than silently emit an unconstrained
        // `{}` with no sign anything is wrong.
        // This is not deduped, unlike the range/temporal diagnostics
        // elsewhere in this class: those dedupe because one scalar is
        // re-walked at every use site, while each occurrence here is a
        // distinct property or payload naming the unsupported type.
        reportDiagnostic(this.program, {
          code: "unsupported-payload-type",
          target: type,
          format: { kind: type.kind },
        });
        return {};
    }
  }

  // Dedupes diagnostics this builder would otherwise report more than once
  // for one mistake; see `SchemaDiagnostics`. Scoped to this instance, so
  // the ledger covers one emit.
  private readonly diagnostics: SchemaDiagnostics;

  private buildModelSchema(model: Model): SchemaObject | ReferenceObject {
    if (isUninstantiatedTemplateDeclaration(model)) {
      return {};
    }

    const build = () => {
      // A model gets an indexer from `is Record<T>`/`is Array<T>`, or from
      // spreading an indexed model. It can also declare its own properties,
      // e.g. `model Bag { id: string; ...Record<string>; }`, and `extends`
      // a base. `no-array-properties` forbids own properties on an
      // array-backed model, so its collection shape is `own` outright. A
      // record-backed model's `additionalProperties` and its own properties
      // are independent, mergeable facts, so both combine into `own`.
      // `applyExtends` always runs afterward and passes `own` through
      // unchanged when there is no `baseModel`, instead of being skipped
      // for a collection-backed model. Skipping it would drop the `Bag`
      // case and any inherited shape whenever a spread indexer was also
      // present.
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
      // `@discriminator` applies here, after `applyExtends` already wrapped
      // the shape in `allOf` for a `baseModel`, not inside
      // `buildObjectSchema`, which only sees the own, pre-`allOf` shape.
      // AsyncAPI's Schema Object reads `discriminator` off the schema
      // object itself, so a 3-level hierarchy would otherwise bury it
      // inside `allOf`'s second branch, where nothing looks for it.
      //
      // This runs unconditionally, even for a collection-backed model,
      // because the decorator legally accepts any Model. `applyDiscriminator`
      // then finds no matching property, reports
      // `missing-discriminator-property`, and omits `discriminator`, rather
      // than dropping the decorator silently.
      return withDocs(
        this.program,
        model,
        applyDiscriminator(this.inheritance, model, shape),
        this.diagnostics,
      );
    };

    // An anonymous use site, such as `string[]` or `Record<int32>`, has no
    // name worth registering, so it always inlines. A named alias, such as
    // `model Names is string[];`, is a real declaration and must go through
    // the same register-and-$ref path as any other named model.
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
   *
   * `getSchemas` runs this, but a caller that inspects claimed keys before
   * the document is assembled can run it directly to see the final set.
   * Running it twice is harmless; the queue drains each time.
   *
   * A subtype is unreachable by walking properties, since only the
   * `extends` link points at it, and that link points the other way. Left
   * unbuilt, a `@discriminator` base would advertise a polymorphic payload
   * while describing none of its variants. Each subtype registers as a
   * component rather than inlining, since an inlined subtype would land
   * nowhere with no property referencing it. Building a subtype can queue
   * more, so the loop runs until the queue is empty; an uninstantiated
   * template declaration is skipped, since its properties are bare template
   * parameters with no real shape.
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
    // A named union earns a component describing the union as declared. An
    // encoded variant is written in place instead, since a reference would
    // describe the un-encoded shape.
    //
    // The build runs unguarded: a variant naming this union again reaches
    // `declareNamed` below, which registers the component and answers with
    // a reference, ending the recursion there.
    if (inlined.size > 0) {
      return build();
    }
    return this.declarations.declareNamed(type, build);
  }

  /**
   * A union of only string literals, such as `"a" | "b"`, collapses to the
   * same `{ type: "string", enum: [...] }` shape a `string`-valued enum
   * gets, giving one code path for a closed set of string values.
   *
   * Any other union, including `T | null`, falls through to `anyOf` (or
   * `oneOf`, see below), one member per variant. JSON Schema has no
   * separate nullability keyword, unlike OpenAPI 3.0's `nullable`, so
   * `T | null` becomes `anyOf: [T, { type: "null" }]` by default. `@oneOf`
   * switches the keyword to `oneOf`, requiring exactly one variant to
   * match instead of `anyOf`'s "at least one"; a union with no `@oneOf`
   * keeps emitting `anyOf`.
   *
   * An empty union has no variant to be, so it returns `{ not: {} }`,
   * meaning nothing is valid, the same as `never`/`void` in
   * `buildIntrinsicSchema`. `anyOf: []` would be the literal encoding but
   * is not a valid draft-07 schema.
   *
   * Each `anyOf` branch passes through `withPropertyDocs`, so a variant's
   * own `@doc`/`@summary`/`@example` is not silently dropped; this is legal
   * directly on a `UnionVariant`. The string-literal-collapsing branch
   * above is untouched, since it already discards individual variants for
   * one shared `enum`, leaving no single variant to document.
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
   * `@discriminated` states how the union travels, not only what it can
   * hold. The default `envelope: "object"` wraps every variant in a
   * two-property object naming and holding it, so
   * `@discriminated union Pet { cat: Cat, dog: Dog }` puts
   * `{ "kind": "cat", "value": { ... } }` on the wire, not a bare `Cat`. A
   * plain union would describe a flatter shape than what travels, and every
   * real message would fail to validate against it. `envelope: "none"` puts
   * the discriminating property inside each variant instead, referencing
   * the variants directly.
   *
   * Each envelope is written inline rather than registered as its own named
   * component: the official emitter's synthesized per-variant name can
   * collide with a name the user already declared, but an inline envelope
   * has no name to collide with and nothing else refers to it.
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
   * `Array`/`Record` template, covering `string[]`, `Record<int32>`, or a
   * named alias declared with `is`. Returns `undefined` when `model` is
   * neither. Shared by both the anonymous-use-site early return and the
   * named-alias path, so the two can never drift apart.
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
   * Builds the `object` shape (`properties`/`required`, omit-empty) from
   * whichever set of properties the caller hands it: a model's own
   * declared properties for the normal case, or the fully
   * `baseModel`-flattened set for the encoded-name-override-conflict
   * fallback.
   */
  private buildObjectSchemaFromProperties(properties: Iterable<ModelProperty>): SchemaObject {
    const propertySchemas: Record<string, SchemaObject | ReferenceObject> = Object.create(
      null,
    ) as Record<string, SchemaObject | ReferenceObject>;
    const required: string[] = [];
    // Guards a wire-name collision between two distinct TypeSpec
    // properties; a property overriding one of the same name is already
    // collapsed by `walkPropertiesInherited`'s by-name dedup. This only
    // arises via the `findEncodedNameOverrideConflict` fallback, where
    // `walkPropertiesInherited` yields the more-derived property first, so
    // the first property to claim a wire name here is always the
    // most-derived one. Without this guard, a later, less-derived property
    // with the same wire name would silently overwrite `propertySchemas`
    // and duplicate an entry in `required`.
    const claimedWireNames = new Set<string>();

    for (const prop of properties) {
      // A never-typed property means "this property does not exist", e.g. a
      // template default `model Env<T = never> { data: T; }` instantiated
      // with no argument, or a direct `x: never` declaration. Emitting it,
      // let alone requiring it, would make the schema unsatisfiable, so
      // skip it; standalone `never` still maps to `{ not: {} }`.
      if (isNeverTypedProperty(prop)) {
        continue;
      }
      // `@invisible` says this property is in no lifecycle phase, so it is
      // left out entirely. A partial `@visibility` is emitted in full and
      // reported, because a message has only one shape to emit it into.
      if (!shouldEmitProperty(this.program, prop, this.diagnostics)) {
        continue;
      }
      // `buildDocFields` below resolves each example's nested property name
      // through `@encodedName`, so the schema's own key must match it.
      // Otherwise a `@example` naming this property by its wire name would
      // fail validation against `required`/`properties` here.
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
   * A property carrying its own `@encode` rewrites the `type`/`format` of
   * the value, and a Reference Object cannot be rewritten: `allOf`
   * intersects, and two different `type`s contradict rather than
   * intersect. So a property like that writes the scalar in place, which
   * every property did before a scalar earned a component. `@format` and
   * `@doc` are the same case: neither is a keyword that intersects, and a
   * `$ref` cannot take the scalar's own text or format away.
   *
   * A validation keyword differs: `minLength` on the property and on the
   * scalar are two constraints on one value, and both holding is what
   * `allOf` means, so a property that only constrains still writes a
   * reference. A named model is not this case either, since its
   * annotations sit at the object level, so a property over one has
   * always layered its own above an `allOf`.
   *
   * A union-typed property asks `encodedUnionVariants` which variants its
   * `@encode` describes, and hands the answer to the union builder. A
   * named union that has one is written in place for the same reason a
   * scalar is: the component describes the union as declared, and a
   * reference to it would carry no encoding at all.
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
      return this.buildUnionSchema(
        prop.type,
        encodedUnionVariants(this.program, prop, this.diagnostics),
      );
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
