import {
  Type,
  Model,
  ModelProperty,
  Scalar,
  IntrinsicType,
  Enum,
  EnumMember,
  Union,
  UnionVariant,
  Namespace,
  Program,
  StringLiteral,
  isArrayModelType,
  isRecordModelType,
  getDoc,
  getSummary,
  getExamples,
  serializeValueAsJson,
  UnserializableValueError,
  resolveEncodedName,
  $example,
  Example,
  getSourceLocation,
  EncodeData,
} from "@typespec/compiler";
import { SchemaObject, ReferenceObject } from "../types/index.js";
import { reportDiagnostic } from "../lib.js";

/**
 * Builds `{ name: { type, format } }` entries for scalars that map to a
 * formatted primitive schema.
 */
function withFormat(type: string, formats: Record<string, string>): Record<string, SchemaObject> {
  return Object.fromEntries(
    Object.entries(formats).map(([name, format]) => [name, { type, format }]),
  );
}

/**
 * TypeSpec built-in scalar name → AsyncAPI schema.
 */
const SCALAR_SCHEMAS: Record<string, SchemaObject> = {
  string: { type: "string" },
  boolean: { type: "boolean" },
  // Abstract numeric scalars: the width is unspecified, so no `format`.
  numeric: { type: "number" },
  integer: { type: "integer" },
  float: { type: "number" },
  ...withFormat("integer", {
    int8: "int8",
    int16: "int16",
    int32: "int32",
    int64: "int64",
    safeint: "int64",
    uint8: "uint8",
    uint16: "uint16",
    uint32: "uint32",
    uint64: "uint64",
  }),
  ...withFormat("number", {
    float32: "float",
    float64: "double",
    decimal: "decimal",
    decimal128: "decimal128",
  }),
  ...withFormat("string", {
    bytes: "byte",
    plainDate: "date",
    plainTime: "time",
    utcDateTime: "date-time",
    offsetDateTime: "date-time",
    duration: "duration",
    url: "uri",
  }),
};

/**
 * True when `scalar` is one of TypeSpec's own built-in scalars (declared in
 * the global `TypeSpec` namespace), as opposed to a user-declared scalar that
 * merely happens to share a name with one (e.g. a `namespace MyLib { scalar
 * duration extends int32; }`). Only built-ins should be looked up directly in
 * `SCALAR_SCHEMAS` by name — a user scalar must instead walk `baseScalar`.
 */
function isBuiltinScalar(scalar: Scalar): boolean {
  const ns = scalar.namespace;
  return ns?.name === "TypeSpec" && !ns.namespace?.name;
}

/**
 * True when `model` is the built-in `Array`/`Record` template instantiated
 * anonymously at a use site (e.g. `string[]`, `Record<int32>`), as opposed to
 * a user's own named alias declared with `is` (e.g. `model Names is
 * string[];`). Only the anonymous use site should stay inlined — a named
 * alias is a real declaration and must be registered like any other named
 * model. TypeSpec's built-in `Array`/`Record` templates live directly in the
 * global `TypeSpec` namespace; a user-declared alias never does.
 */
function isBuiltinCollectionInstantiation(model: Model): boolean {
  const ns = model.namespace;
  return ns?.name === "TypeSpec" && !ns.namespace?.name;
}

/**
 * Returns the dot-separated fully qualified name of a named declaration
 * (e.g. `Foo.Bar.Model`). Declarations in the global namespace have no
 * prefix. Shared by every kind of named type that can be registered into
 * `components.schemas` (model, enum, named union).
 */
function getQualifiedName(name: string, namespace: Namespace | undefined): string {
  const parts = [name];
  let ns = namespace;
  while (ns?.name) {
    parts.unshift(ns.name);
    ns = ns.namespace;
  }
  return parts.join(".");
}

/**
 * Escapes a `components.schemas` key for use as a JSON Pointer token inside a
 * `$ref` (RFC 6901: `~` → `~0`, `/` → `~1`). Model/namespace identifiers can
 * contain arbitrary characters via backquoting, and a raw `/` or `~` would
 * otherwise produce a `$ref` that every conforming resolver misreads as a
 * path through nested objects. The key stored in `this.schemas` is left
 * unescaped — only the `$ref` string needs this.
 */
function toJsonPointerToken(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}

/**
 * TypeSpec intrinsic type (`null`, `never`, `void`, `unknown`, error type)
 * → AsyncAPI schema.
 */
function buildIntrinsicSchema(type: IntrinsicType): SchemaObject {
  switch (type.name) {
    case "null":
      return { type: "null" };
    case "never":
    case "void":
      // No value is valid: nothing matches `{ not: {} }`.
      return { not: {} };
    default:
      // `unknown` (and the error type): any value is valid.
      return {};
  }
}

/**
 * TypeSpec `enum` → AsyncAPI schema. Each member contributes its explicit
 * value (`Red: "R"`) when given, falling back to the member's own name
 * otherwise (`enum Color { Red, Green }` → values `"Red"`, `"Green"`) — the
 * same default TypeSpec itself uses for an unvalued member. `type` is
 * `"number"` only when every member ends up with a numeric value, `"string"`
 * only when every member ends up with a string value; a mix of the two omits
 * `type` entirely (rather than picking one) since `enum` alone already
 * constrains the value and a mismatched `type` would make the members of the
 * other kind unsatisfiable. An empty enum has no member to be, so — like
 * `never`/`void` in `buildIntrinsicSchema` — it returns `{ not: {} }` (nothing
 * is valid) rather than `{}` (anything is valid): `enum: []` would be the
 * literally correct encoding of "no value" but is not a valid draft-07
 * schema, so `{ not: {} }` stands in as the closest valid equivalent.
 */
function buildEnumSchemaBody(type: Enum): SchemaObject {
  if (type.members.size === 0) {
    return { not: {} };
  }
  const values: (string | number)[] = [
    ...new Set([...type.members.values()].map((member) => member.value ?? member.name)),
  ];
  const isNumeric = values.every((value) => typeof value === "number");
  const isString = values.every((value) => typeof value === "string");
  let schemaType: SchemaObject["type"];
  if (isNumeric) {
    schemaType = "number";
  } else if (isString) {
    schemaType = "string";
  }
  return { ...(schemaType !== undefined ? { type: schemaType } : {}), enum: values };
}

/**
 * A single enum member used as a type on its own (`Color.Red`, or as one
 * variant of a union like `Color.Red | Color.Green`) is the same shape as a
 * `string`/`number` literal type: a schema constrained to exactly one value.
 */
function buildEnumMemberSchema(member: EnumMember): SchemaObject {
  const value = member.value ?? member.name;
  return { type: typeof value === "number" ? "number" : "string", enum: [value] };
}

/**
 * True for an uninstantiated template *declaration* (e.g. the `Env` reached
 * by naming it directly in source, as opposed to an instantiation like
 * `Env<string>` or a defaulted use site `Env`). Its properties/variants are
 * bare `TemplateParameter`s with no real shape, so there is nothing
 * meaningful to build — the caller emits the unconstrained schema instead of
 * registering a bogus key. Shared by every named declaration kind that can
 * be a template (model, union).
 */
function isUninstantiatedTemplateDeclaration(type: Model | Union): boolean {
  return (
    type.node !== undefined &&
    "templateParameters" in type.node &&
    type.node.templateParameters.length > 0 &&
    type.templateMapper === undefined
  );
}

/** A `$ref` pointing at `key` inside `components.schemas`. */
function refFor(key: string): ReferenceObject {
  return { $ref: `#/components/schemas/${toJsonPointerToken(key)}` };
}

/**
 * The mime type a schema's own property keys (and, via the compiler's own
 * `serializeObjectValueAsJson`, an `@example`'s object keys) are resolved
 * against through `@encodedName`. Hardcoded because 2.7 has no notion yet of
 * a message's actual wire `contentType` — a model with e.g. both
 * `@encodedName("application/json", ...)` and
 * `@encodedName("application/xml", ...)` always emits the JSON name
 * regardless of which content type a message actually declares. Phase 3
 * (per-message content types) must thread the real `contentType` through to
 * both this constant's use site and the example serialization it keeps in
 * sync with, rather than assuming JSON everywhere.
 */
const SCHEMA_ENCODING_MIME_TYPE = "application/json";

/**
 * A defined (non-`undefined`) `encodeAs` whose `encoding` matches none of the
 * compiler's known encodings (`unixTimestamp`/`rfc7231` for date-times,
 * `seconds` for durations — see `ScalarSerializers` in
 * `@typespec/compiler`'s `lib/examples.js`), so every serializer falls
 * through to its un-encoded, "no `@encode` applied" representation. `type`
 * is only read back out of this value on the `duration` + `seconds` branch,
 * which this `encoding` never reaches, so any scalar can stand in for it.
 */
function neutralEncodeAs(type: Scalar): EncodeData {
  return { encoding: "rfc3339", type };
}

/**
 * `serializeValueAsJson`'s handlers hook, used below for two purposes: (1)
 * turning a scalar it cannot represent (`resolveKnownScalar` returning
 * `undefined` for an unsupported/custom scalar constructor) into a thrown
 * `UnserializableValueError` instead of a silent `undefined` return —
 * without this, an unrepresentable scalar nested inside an array or object
 * value would leave a stray `undefined` buried in the result, invisible to a
 * top-level `undefined` check; and (2) making sure no `@encode` — whether
 * declared on the scalar itself, on a property of the immediate type, or on
 * a property nested arbitrarily deep inside a model/array value — is ever
 * applied while serializing an example. 2.7's `buildScalarSchema` does not
 * map `@encode` into a schema's `type`/`format` (that is plan 2.8's scope),
 * so an example that *did* apply `@encode` would encode a value the schema
 * itself does not declare and fail validation against its own schema.
 *
 * The compiler binds `originalFn` to the exact `encodeAs` this call
 * received, so re-invoking it with a different `encodeAs` argument has no
 * effect (the extra argument is silently ignored) — and `resolveKnownScalar`
 * unconditionally re-reads the scalar's own `@encode` internally regardless
 * of what is passed in. So skipping `@encode` here instead re-enters the
 * compiler's *exported* `serializeValueAsJson` (not the bound `originalFn`)
 * with a defined, neutral `encodeAs` (see `neutralEncodeAs`): since
 * `encodeAs ?? result.encodeAs` favors an already-defined `encodeAs`, this
 * neutral value wins over any `@encode` `resolveKnownScalar` would otherwise
 * pick up, without needing to know all the ways `@encode` could reach this
 * value.
 */
function makeSerializeHandlers(program: Program): Parameters<typeof serializeValueAsJson>[4] {
  return {
    serializeScalarValue: (value, type) => {
      const result = serializeValueAsJson(program, value, type, neutralEncodeAs(value.scalar));
      if (result === undefined) {
        throw new UnserializableValueError(
          `Cannot serialize scalar '${value.scalar.name}' as JSON.`,
        );
      }
      return result;
    },
  };
}

/**
 * Recovers source order for `getExamples`' result. `getExamples` returns
 * decorators in the order they were *applied*, not necessarily the order
 * they appear in source: inline `@example` decorators execute bottom-up
 * (last-listed executes first), while `@@example` augment decorators are
 * spliced in *before* the inline ones by the checker (see `checkDecorators`
 * in `@typespec/compiler`'s `checker.js`) — so a blanket reverse (correct
 * for inline-only decorators) inverts the relative order of augment
 * decorators instead. `target.decorators` is public, in the same execution
 * order `getExamples`' raw result is in, and pairs up 1:1 with it — so
 * filtering it down to the `@example` applications and sorting by each
 * one's source position recovers true source order for both inline and
 * augment decorators, and any mix of the two.
 *
 * A decorator's `node.pos` is only a byte offset *within its own source
 * file* — comparing `pos` across two different `.tsp` files compares
 * unrelated numbers, so when a type's `@example`s are spread across files
 * the sort key must rank by file first. `program.sourceFiles` is a `Map`
 * whose insertion order matches the order files were reached while
 * compiling (`main.tsp` first, each `import` the first time it is reached),
 * so indexing into it gives a stable, execution-order-consistent file
 * ranking; `pos` remains the tie-break for two examples in the same file.
 */
function orderExamplesBySource(
  program: Program,
  target: Model | Scalar | Enum | Union | ModelProperty | UnionVariant,
  rawExamples: readonly Example[],
): Example[] {
  const exampleNodes = target.decorators.filter((d) => d.decorator === $example).map((d) => d.node);
  if (exampleNodes.length !== rawExamples.length) {
    // Should not happen (every applied `@example` has a source node), but
    // fall back to the previous best-effort behavior rather than throw.
    return [...rawExamples].reverse();
  }
  const fileOrder = new Map<string, number>();
  for (const path of program.sourceFiles.keys()) {
    fileOrder.set(path, fileOrder.size);
  }
  const keys: { fileIndex: number; pos: number }[] = [];
  for (const node of exampleNodes) {
    if (node === undefined) {
      // Should not happen (every applied `@example` has a source node), but
      // fall back to the previous best-effort behavior rather than throw.
      return [...rawExamples].reverse();
    }
    const location = getSourceLocation(node);
    keys.push({ fileIndex: fileOrder.get(location.file.path) ?? -1, pos: node.pos });
  }
  return rawExamples
    .map((example, i) => ({ example, ...keys[i] }))
    .sort((a, b) => a.fileIndex - b.fileIndex || a.pos - b.pos)
    .map((entry) => entry.example);
}

/**
 * `title`/`description`/`examples` contributed by a declaration's own
 * documentation decorators: `@summary` → `title`, `@doc` (or a plain doc
 * comment, which `getDoc` already resolves to the same thing) →
 * `description`, and TypeSpec's built-in `@example` → `examples` (each
 * example value serialized to plain JSON against `exampleValueType`, in
 * source order — see `orderExamplesBySource`). A value `serializeValueAsJson`
 * cannot represent (an unsupported scalar constructor, anywhere in the
 * value — including nested inside an array or object — or a function value)
 * causes that whole example to be dropped rather than left to throw past
 * this builder or to leak in as a JSON `null`/a silently-missing key —
 * either way the example carries no usable information. A dropped example
 * still reports the `unserializable-example` warning diagnostic (targeting
 * the declaration/property the `@example` was applied to) so the drop is not
 * completely silent, even though the emitted schema itself has no field to
 * say so. Omits any field whose decorator was not applied, per the emitter's
 * omit-empty convention.
 *
 * Note: `ExampleOptions`'s `title`/`description` (the `@example`'s second
 * argument) are deliberately not read here. draft-07's `examples` keyword is
 * a bare array of values with nowhere to hang a per-entry title/description,
 * so this phase has no field to put them in; Phase 3 (message-level
 * examples, which have their own `name`/`summary` fields) is where they get
 * picked up.
 */
function buildDocFields(
  program: Program,
  target: Model | Scalar | Enum | Union | ModelProperty | UnionVariant,
  exampleValueType: Type,
): Pick<SchemaObject, "title" | "description" | "examples"> {
  const title = getSummary(program, target);
  const description = getDoc(program, target);
  const handlers = makeSerializeHandlers(program);
  // `@example`'s own `extern dec` declaration legally targets `UnionVariant`
  // (see `decorators.tsp`), but `getExamples`'s exported TS signature omits
  // it — a typing gap in `@typespec/compiler` itself, not a real runtime
  // restriction (its state is stored generically over `Type`). The cast
  // below only widens the static type to match what the decorator already
  // allows.
  const rawExamples = getExamples(program, target as Model | Scalar | Enum | Union | ModelProperty);
  const examples = orderExamplesBySource(program, target, rawExamples)
    .map((example) => {
      try {
        return serializeValueAsJson(program, example.value, exampleValueType, undefined, handlers);
      } catch {
        // An example that carries no usable information (unserializable
        // scalar per `UnserializableValueError`, or any other failure —
        // e.g. the compiler's own duration serializer throws a plain
        // `RangeError` from `Temporal.Duration.from` on a malformed
        // `duration.fromISO(...)` value that the compiler never validates)
        // is dropped rather than left to crash the whole emit. Still surface
        // it as a diagnostic rather than dropping it in total silence.
        reportDiagnostic(program, { code: "unserializable-example", target });
        return undefined;
      }
    })
    .filter((value) => value !== undefined);
  return {
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(examples.length > 0 ? { examples } : {}),
  };
}

/**
 * Merges a declaration's own documentation fields onto its (always plain,
 * never-a-`$ref`) schema body — used for the model/enum/union bodies built
 * inside `registerNamed`, which are never a bare `$ref` to themselves.
 */
function withDocs(
  program: Program,
  target: Model | Scalar | Enum | Union,
  schema: SchemaObject,
): SchemaObject {
  return { ...schema, ...buildDocFields(program, target, target) };
}

/**
 * Merges a property's (or union variant's) own documentation fields onto its
 * schema entry. A property typed as a named declaration builds to a bare
 * `$ref` (see `buildSchema`), which per JSON Schema has no sibling keywords
 * of its own — so a ref is wrapped in `allOf` to give the property's
 * `title`/`description`/`examples` somewhere valid to live, while a plain
 * inline schema gets them merged in directly. `prop.type` (not `prop` itself)
 * is passed as the example's value type: passing `prop` would make
 * `serializeValueAsJson` apply the property's own `@encode` to the example,
 * but 2.7's `buildScalarSchema` does not yet map `@encode` into the schema's
 * `type`/`format` (that is plan 2.8's scope) — encoding only the example and
 * not the schema would produce an example that fails validation against its
 * own property's schema. Shared with `buildUnionSchemaBody` for a union
 * variant's own `@doc`/`@summary`/`@example` (`UnionVariant` has the same
 * `type` shape a `ModelProperty` does, and is a legal `@example` target per
 * `decorators.tsp`).
 */
function withPropertyDocs(
  program: Program,
  prop: ModelProperty | UnionVariant,
  schema: SchemaObject | ReferenceObject,
): SchemaObject | ReferenceObject {
  const docs = buildDocFields(program, prop, prop.type);
  if (Object.keys(docs).length === 0) {
    return schema;
  }
  if ("$ref" in schema) {
    return { allOf: [schema], ...docs };
  }
  // The property has its own title and/or description: it fully determines
  // this use site's title/description, replacing (not merging with)
  // whatever the scalar's own schema shape may have baked in via
  // `buildScalarSchema` — otherwise a property overriding only e.g.
  // `@summary` would incoherently keep the underlying scalar's `@doc` as its
  // `description`. `examples` does not affect either field, so a property
  // that only adds its own `@example` must not strip the scalar's inherited
  // `title`/`description` — only gate the deletion on the fields actually
  // being overridden.
  const rest: SchemaObject = { ...schema };
  if (docs.title !== undefined || docs.description !== undefined) {
    delete rest.title;
    delete rest.description;
  }
  return { ...rest, ...docs };
}

/**
 * Builder for converting TypeSpec types to AsyncAPI Schema Objects.
 */
export class SchemaBuilder {
  public constructor(private readonly program: Program) {}

  private readonly schemas: Record<string, SchemaObject> = Object.create(null) as Record<
    string,
    SchemaObject
  >;

  public getSchemas(): Record<string, SchemaObject> {
    return this.schemas;
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
        return { type: "string", enum: [type.value] };
      case "Number":
        return { type: "number", enum: [type.value] };
      case "Boolean":
        return { type: "boolean", enum: [type.value] };
      default:
        return {};
    }
  }

  // Keyed by the type itself (model, enum, or named union) rather than a
  // narrower type so every kind of named declaration shares one registry —
  // and, with it, one circular-reference guard.
  private readonly building = new Set<Type>();
  private readonly schemaKeys = new Map<Type, string>();
  private readonly usedKeys = new Set<string>();

  /**
   * Returns the `components.schemas` key for a named declaration (model,
   * enum, or named union), registering it on first use. Uses the bare name
   * unless another declaration already claimed it, in which case the
   * dot-separated fully qualified name (e.g. `Foo.Bar.Model`) is used.
   * The qualified name is not guaranteed unique either — a global-namespace
   * declaration's qualified name equals its bare name, and every
   * instantiation of one template shares both — so taken candidates fall
   * through to the qualified name with a numeric suffix (e.g. `Foo.Bar.Model_2`).
   */
  private getSchemaKey(type: Type, name: string, namespace: Namespace | undefined): string {
    const cached = this.schemaKeys.get(type);
    if (cached !== undefined) {
      return cached;
    }
    const key = this.findFreeKey(name, namespace);
    this.schemaKeys.set(type, key);
    this.usedKeys.add(key);
    return key;
  }

  private findFreeKey(name: string, namespace: Namespace | undefined): string {
    if (!this.usedKeys.has(name)) {
      return name;
    }
    const qualified = getQualifiedName(name, namespace);
    if (!this.usedKeys.has(qualified)) {
      return qualified;
    }
    for (let n = 2; ; n++) {
      const candidate = `${qualified}_${String(n)}`;
      if (!this.usedKeys.has(candidate)) {
        return candidate;
      }
    }
  }

  private buildModelSchema(model: Model): SchemaObject | ReferenceObject {
    if (isUninstantiatedTemplateDeclaration(model)) {
      return {};
    }

    const build = () =>
      withDocs(
        this.program,
        model,
        this.buildCollectionSchema(model) ?? this.buildObjectSchema(model),
      );

    // The anonymous use site (`string[]`, `Record<int32>`) has no name of
    // its own worth registering — it always inlines. A *named* array/record
    // alias (`model Names is string[];`) is a real declaration and must go
    // through the same register-and-$ref path as any other named model
    // instead, so only the anonymous case returns early here.
    if (isBuiltinCollectionInstantiation(model)) {
      const collection = this.buildCollectionSchema(model);
      if (collection !== undefined) {
        return collection;
      }
    }

    if (!model.name) {
      return build();
    }
    return this.registerNamed(model, model.name, model.namespace, build);
  }

  /**
   * Registers `type` under a fresh `components.schemas` key on first use
   * (computing its schema body via `build`) and returns a `$ref` to it;
   * repeat calls for the same type — including a call reached while `build`
   * for it is still running, i.e. a circular reference — return the same
   * `$ref` without recomputing. Shared by every named declaration kind
   * (model, enum, named union) so the register/$ref/circular-guard dance
   * lives in exactly one place.
   */
  private registerNamed(
    type: Type,
    name: string,
    namespace: Namespace | undefined,
    build: () => SchemaObject,
  ): ReferenceObject {
    const key = this.getSchemaKey(type, name, namespace);
    if (Object.hasOwn(this.schemas, key) || this.building.has(type)) {
      return refFor(key);
    }
    this.building.add(type);
    try {
      this.schemas[key] = build();
    } catch (error) {
      // `build()` failed: release the key this type claimed so it is not
      // left registered under `schemaKeys`/`usedKeys` with no corresponding
      // entry in `this.schemas` — otherwise a retry (or another reference to
      // the same type) would see `this.building` no longer containing it and
      // `this.schemas` still missing the key, and return a `$ref` pointing at
      // a component that will never exist.
      this.schemaKeys.delete(type);
      this.usedKeys.delete(key);
      throw error;
    } finally {
      this.building.delete(type);
    }
    return refFor(key);
  }

  private buildEnumSchema(type: Enum): ReferenceObject {
    return this.registerNamed(type, type.name, type.namespace, () =>
      withDocs(this.program, type, buildEnumSchemaBody(type)),
    );
  }

  private buildUnionSchema(type: Union): SchemaObject | ReferenceObject {
    if (isUninstantiatedTemplateDeclaration(type)) {
      return {};
    }
    const build = () => withDocs(this.program, type, this.buildUnionSchemaBody(type));
    if (type.name === undefined) {
      return build();
    }
    return this.registerNamed(type, type.name, type.namespace, build);
  }

  /**
   * A union of only string literals (`"a" | "b"`) collapses to the same
   * `{ type: "string", enum: [...] }` shape a `string`-valued enum gets —
   * one code path for "a closed set of string values", same as `buildSchema`
   * already does for a lone string literal. Any other union (including
   * `T | null`) falls through to `anyOf`, one member per variant; JSON
   * Schema (unlike OpenAPI 3.0's `nullable`) has no separate nullability
   * keyword, so `T | null` becomes `anyOf: [T, { type: "null" }]`. An empty
   * union has no variant to be, so — like `never`/`void` in
   * `buildIntrinsicSchema` — it returns `{ not: {} }` (nothing is valid)
   * rather than `{}` (anything is valid): `anyOf: []` would be the literally
   * correct encoding of "no variant" but is not a valid draft-07 schema.
   *
   * Each `anyOf` branch is passed through `withPropertyDocs` so a variant's
   * own `@doc`/`@summary`/`@example` (legal directly on a `UnionVariant`, see
   * `decorators.tsp`) is not silently dropped — same merge/`allOf`-wrap
   * behavior a model property's documentation already gets. The
   * string-literal-collapsing branch above stays untouched: it already
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
        type: "string",
        enum: [...new Set(variants.map((variant) => (variant.type as StringLiteral).value))],
      };
    }
    return {
      anyOf: variants.map((variant) =>
        withPropertyDocs(this.program, variant, this.buildSchema(variant.type)),
      ),
    };
  }

  /**
   * Builds the `array`/`object` shape for a model backed by the built-in
   * `Array`/`Record` template (`string[]`, `Record<int32>`, or a named alias
   * declared with `is`), or `undefined` when `model` is neither. Shared by
   * both the anonymous-use-site early return and the named-alias path so the
   * two can never drift apart.
   */
  private buildCollectionSchema(model: Model): SchemaObject | undefined {
    if (isArrayModelType(model)) {
      return { type: "array", items: this.buildSchema(model.indexer.value) };
    }
    if (isRecordModelType(model)) {
      return { type: "object", additionalProperties: this.buildSchema(model.indexer.value) };
    }
    return undefined;
  }

  /** Builds the `object` shape for a plain (non-collection) model. */
  private buildObjectSchema(model: Model): SchemaObject {
    const properties: Record<string, SchemaObject | ReferenceObject> = Object.create(
      null,
    ) as Record<string, SchemaObject | ReferenceObject>;
    const required: string[] = [];

    for (const prop of model.properties.values()) {
      // A never-typed property means "this property does not exist" (e.g. a
      // template default `model Env<T = never> { data: T; }` instantiated as
      // `Env` with no type argument, or a direct `x: never` declaration).
      // Emitting it — let alone requiring it — would make the schema
      // unsatisfiable, so skip it entirely. Standalone `never` still maps to
      // `{ not: {} }`.
      if (prop.type.kind === "Intrinsic" && prop.type.name === "never") {
        continue;
      }
      // The compiler's own example serializer (`serializeValueAsJson`, used
      // by `buildDocFields` below) resolves each nested object property name
      // through `@encodedName` for `SCHEMA_ENCODING_MIME_TYPE`; the schema's
      // own property key must match it, or a model-level/property-level
      // `@example` naming this property by its wire name would fail
      // validation against `required`/`properties` here.
      const wireName = resolveEncodedName(this.program, prop, SCHEMA_ENCODING_MIME_TYPE);
      properties[wireName] = withPropertyDocs(this.program, prop, this.buildSchema(prop.type));
      if (!prop.optional) {
        required.push(wireName);
      }
    }

    const schema: SchemaObject = { type: "object" };
    // Omit empty fields instead of emitting `properties: {}` (same
    // omit-empty convention `required` follows below).
    if (Object.keys(properties).length > 0) {
      schema.properties = properties;
    }
    if (required.length > 0) {
      schema.required = required;
    }
    return schema;
  }

  private buildScalarSchema(scalar: Scalar): SchemaObject {
    // TypeSpec's own built-in scalars (`string`, `int32`, ...) carry their
    // own standard-library doc comments (e.g. `string` → "A sequence of
    // textual characters."); surfacing those on every plain `string`/`int32`
    // field would flood the output, so only a user-declared scalar's own
    // documentation is applied here. `buildScalarSchemaShapeWithDocs` walks
    // the whole `baseScalar` chain so documentation on an intermediate/base
    // user scalar is not lost when the use site is derived through more than
    // one level (e.g. `scalar WorkEmail extends Email;` where only `Email`
    // itself carries `@doc`/`@summary`/`@example`).
    return this.buildScalarSchemaShapeWithDocs(scalar);
  }

  /**
   * The `type`/`format` shape for `scalar`, merged with documentation
   * collected along the entire `baseScalar` chain: the base's own docs are
   * applied first, then each more-derived level's own `@summary`/`@doc`
   * /`@example` overrides them (`withDocs`'s object-spread semantics already
   * give the more specific fields priority when merged last). Built-in
   * scalars never contribute documentation (see `isBuiltinScalar` at the
   * `buildScalarSchema` call site's doc comment) — only the shape. Bottoms
   * out at the first built-in ancestor found (or the unconstrained `{}`
   * shape for an unmapped root scalar) and merges each user-declared level's
   * docs back on the way up. `withPropertyDocs` on the use site can still
   * override with the property's own documentation afterwards.
   */
  private buildScalarSchemaShapeWithDocs(scalar: Scalar): SchemaObject {
    if (isBuiltinScalar(scalar)) {
      return Object.hasOwn(SCALAR_SCHEMAS, scalar.name) ? { ...SCALAR_SCHEMAS[scalar.name] } : {};
    }
    // Derived (user-declared) scalar: start from its base scalar's shape
    // (recursing all the way to a built-in ancestor, or `{}` for an unmapped
    // root scalar), then merge this level's own documentation on top.
    const base = scalar.baseScalar ? this.buildScalarSchemaShapeWithDocs(scalar.baseScalar) : {};
    return withDocs(this.program, scalar, base);
  }
}
