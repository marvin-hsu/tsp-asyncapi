import {
  Type,
  Model,
  Scalar,
  IntrinsicType,
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
 * Returns the dot-separated fully qualified name of a model
 * (e.g. `Foo.Bar.Model`). Models in the global namespace have no prefix.
 */
function getQualifiedName(model: Model): string {
  const parts = [model.name];
  let ns = model.namespace;
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
 * Builder for converting TypeSpec types to AsyncAPI Schema Objects.
 */
export class SchemaBuilder {
  private schemas: Record<string, SchemaObject> = Object.create(null) as Record<
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
        // return this.buildEnumSchema(type);
        return { type: "string" };
      case "Union":
        // return this.buildUnionSchema(type);
        return {};
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

  private building = new Set<Model>();
  private schemaKeys = new Map<Model, string>();
  private usedKeys = new Set<string>();

  /**
   * Returns the `components.schemas` key for a named model. Uses the bare
   * model name unless another model already claimed it, in which case the
   * dot-separated fully qualified name (e.g. `Foo.Bar.Model`) is used.
   * The qualified name is not guaranteed unique either — a global-namespace
   * model's qualified name equals its bare name, and every instantiation of
   * one template shares both — so taken candidates fall through to the
   * qualified name with a numeric suffix (e.g. `Foo.Bar.Model_2`).
   */
  private getSchemaKey(model: Model): string {
    const cached = this.schemaKeys.get(model);
    if (cached !== undefined) {
      return cached;
    }
    const key = this.findFreeKey(model);
    this.schemaKeys.set(model, key);
    this.usedKeys.add(key);
    return key;
  }

  private findFreeKey(model: Model): string {
    if (!this.usedKeys.has(model.name)) {
      return model.name;
    }
    const qualified = getQualifiedName(model);
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
    // An uninstantiated template *declaration* (e.g. the `Env` reached by
    // naming it directly in source, as opposed to an instantiation like
    // `Env<string>` or a defaulted use site `Env`) has properties whose
    // types are bare `TemplateParameter`s with no real shape. Building it
    // would fall into the `default: return {}` branch per property and
    // silently emit a required-but-unconstrained schema. There is nothing
    // meaningful to build here, so emit the unconstrained schema instead of
    // registering a bogus key.
    if (
      model.node !== undefined &&
      "templateParameters" in model.node &&
      model.node.templateParameters.length > 0 &&
      model.templateMapper === undefined
    ) {
      return {};
    }

    // The anonymous use site (`string[]`, `Record<int32>`) has no name of
    // its own worth registering — it always inlines. A *named* array/record
    // alias (`model Names is string[];`) is a real declaration and must go
    // through the same register-and-$ref path as any other named model
    // instead, so only the anonymous case returns early here.
    const isAnonymousCollection =
      isBuiltinCollectionInstantiation(model) &&
      (isArrayModelType(model) || isRecordModelType(model));
    if (isAnonymousCollection) {
      const collection = this.buildCollectionSchema(model);
      if (collection !== undefined) {
        return collection;
      }
    }

    const key = model.name ? this.getSchemaKey(model) : undefined;

    if (key !== undefined) {
      if (Object.hasOwn(this.schemas, key) || this.building.has(model)) {
        return { $ref: `#/components/schemas/${toJsonPointerToken(key)}` };
      }
      this.building.add(model);
    }

    let schema: SchemaObject;

    const collection = this.buildCollectionSchema(model);
    if (collection !== undefined) {
      schema = collection;
    } else {
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

      schema = { type: "object" };
      // Omit empty fields instead of emitting `properties: {}` (same
      // omit-empty convention `required` follows below).
      if (Object.keys(properties).length > 0) {
        schema.properties = properties;
      }
      if (required.length > 0) {
        schema.required = required;
      }
    }

    if (key !== undefined) {
      this.schemas[key] = schema;
      this.building.delete(model);
      return { $ref: `#/components/schemas/${toJsonPointerToken(key)}` };
    }
    return schema;
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
