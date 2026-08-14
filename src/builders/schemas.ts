import {
  Type,
  Model,
  Scalar,
  IntrinsicType,
  Enum,
  EnumMember,
  Union,
  Namespace,
  StringLiteral,
  isArrayModelType,
  isRecordModelType,
} from "@typespec/compiler";
import { SchemaObject, ReferenceObject } from "../types/index.js";

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
  return {
    ...(isNumeric ? { type: "number" } : isString ? { type: "string" } : {}),
    enum: values,
  };
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
 * Builder for converting TypeSpec types to AsyncAPI Schema Objects.
 */
export class SchemaBuilder {
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

    const build = () => this.buildCollectionSchema(model) ?? this.buildObjectSchema(model);

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
    const schema = build();
    this.schemas[key] = schema;
    this.building.delete(type);
    return refFor(key);
  }

  private buildEnumSchema(type: Enum): ReferenceObject {
    return this.registerNamed(type, type.name, type.namespace, () => buildEnumSchemaBody(type));
  }

  private buildUnionSchema(type: Union): SchemaObject | ReferenceObject {
    if (isUninstantiatedTemplateDeclaration(type)) {
      return {};
    }
    const build = () => this.buildUnionSchemaBody(type);
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
    return { anyOf: variants.map((variant) => this.buildSchema(variant.type)) };
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
      properties[prop.name] = this.buildSchema(prop.type);
      if (!prop.optional) {
        required.push(prop.name);
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
    if (isBuiltinScalar(scalar) && Object.hasOwn(SCALAR_SCHEMAS, scalar.name)) {
      return { ...SCALAR_SCHEMAS[scalar.name] };
    }
    // Derived scalar: fall back to its base scalar.
    if (scalar.baseScalar) {
      return this.buildScalarSchema(scalar.baseScalar);
    }
    // Unmapped root scalar (e.g. a user-declared `scalar Opaque;`): nothing
    // is known about its values, so emit the unconstrained schema — the same
    // mapping `unknown` gets — instead of guessing a primitive type.
    return {};
  }
}
