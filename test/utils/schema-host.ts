import { Model } from "@typespec/compiler";
import { t, TemplateWithMarkers } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing.js";
import { SchemaBuilder } from "#emitter/lower/schemas.js";
import type { SchemaObject } from "#emitter/types/index.js";

/**
 * A `t.code` template, whatever types it marks.
 *
 * The argument must be `any`, matching the compiler's own `compile`
 * signature. A narrower constraint fails a concrete template and infers
 * `{}` for the marked types instead.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MarkedTemplate = TemplateWithMarkers<any>;

/**
 * Compiles `code` and returns a fresh `SchemaBuilder`, plus the program and
 * each type the code marked. Replaces the create-instance / compile /
 * new-builder steps a schema test would otherwise repeat.
 *
 * @param code - The TypeSpec source, with a marker per type to return
 * @returns The builder, plus the whole compile result
 */
export async function compileSchemas<T extends MarkedTemplate>(code: T) {
  const runner = await AsyncAPITester.createInstance();
  const result = await runner.compile(code);
  return { builder: new SchemaBuilder(runner.program), ...result };
}

/**
 * Compiles `code` and hands back its diagnostics, for a source expected to
 * produce one.
 *
 * `#deprecated` needs this: the compiler warns at every use site of a
 * deprecated declaration, so such a test cannot go through `compileSchemas`.
 *
 * @param code - The TypeSpec source, with a marker per type to return
 * @returns The builder and the compile result, plus the diagnostics
 */
export async function compileSchemasWithDiagnostics<T extends MarkedTemplate>(code: T) {
  const runner = await AsyncAPITester.createInstance();
  const [result, diagnostics] = await runner.compileAndDiagnose(code);
  return { builder: new SchemaBuilder(runner.program), diagnostics, ...result };
}

/**
 * Compiles `code` and builds the schema of the model it marks as `M`.
 * Covers the common case: a test that needs only one model's schema.
 *
 * @param code - The TypeSpec source, which must mark a model named `M`
 * @returns The builder, plus the whole compile result
 */
export async function buildDocSchema<T extends MarkedTemplate & TemplateWithMarkers<{ M: Model }>>(
  code: T,
) {
  const context = await compileSchemas(code);
  context.builder.buildSchema(context.M);
  return context;
}

/**
 * Builds the schema of a `Holder` the source declares, and returns its
 * properties.
 *
 * The annotation and encoding suites both ask what one decorator does to
 * the property it sits on. Both wrap the body in a model that refers to
 * `Holder`, so this helper replaces two identical copies of that step.
 * Other schema suites look similar but differ: one returns every schema
 * instead of one model's properties, and one also needs the diagnostics.
 *
 * The values come back as `unknown`, because a keyword is read by name and
 * `SchemaObject` declares its keywords as fields, not an index signature.
 *
 * @param body - The declarations under test, including a `Holder` model
 * @returns The properties of `Holder`'s emitted schema
 */
export async function holderProperties(body: string): Promise<Record<string, SchemaObject>> {
  const { builder, M } = await compileSchemas(t.code`
    ${body}
    model ${t.model("M")} {
      target: Holder;
    }
  `);
  builder.buildSchema(M);
  const schemas = builder.getSchemas();
  const properties = schemas.Holder.properties as Record<string, SchemaObject>;
  return Object.fromEntries(
    Object.entries(properties).map(([name, schema]) => [name, resolveSchemaRefs(schemas, schema)]),
  );
}

/**
 * Replaces every `$ref` into `components.schemas` with what it points at.
 *
 * A user-declared scalar earns a component, and every use site writes a
 * reference to it. A test asking what a decorator does to a value is not
 * asking where that value is written, so it reads through this instead.
 *
 * @param schemas - The built `components.schemas`
 * @param schema - One schema, possibly a reference or holding one
 * @returns The same schema with every local reference followed
 */
function resolveSchemaRefs(schemas: Record<string, SchemaObject>, schema: unknown): SchemaObject {
  if (Array.isArray(schema)) {
    return schema.map((item) => resolveSchemaRefs(schemas, item)) as unknown as SchemaObject;
  }
  if (schema === null || typeof schema !== "object") {
    return schema as SchemaObject;
  }
  const entries = Object.entries(schema as Record<string, unknown>);
  const ref = (schema as { $ref?: unknown }).$ref;
  if (typeof ref === "string" && ref.startsWith(LOCAL_SCHEMA_PREFIX)) {
    const key = ref.slice(LOCAL_SCHEMA_PREFIX.length);
    if (!Object.hasOwn(schemas, key)) {
      throw new Error(`This test follows '${ref}', and nothing is there.`);
    }
    return resolveSchemaRefs(schemas, schemas[key]);
  }
  return Object.fromEntries(
    entries.map(([key, value]) => [key, resolveSchemaRefs(schemas, value)]),
  );
}

/** Where a schema reference points inside one document. */
const LOCAL_SCHEMA_PREFIX = "#/components/schemas/";

/**
 * The properties of one built schema, with every schema reference followed.
 *
 * The counterpart of {@link holderProperties} for a test that builds its
 * own model, answering what a property's schema says rather than where
 * that schema is written.
 *
 * @param builder - The builder that has already built the model
 * @param key - The `components.schemas` key of the model
 * @returns The properties, with every local reference resolved
 */
export function resolvedProperties(
  builder: SchemaBuilder,
  key: string,
): Record<string, SchemaObject> {
  const schemas = builder.getSchemas();
  if (!Object.hasOwn(schemas, key)) {
    throw new Error(`This test needs a schema named '${key}', and there is none.`);
  }
  const properties = schemas[key].properties ?? {};
  return Object.fromEntries(
    Object.entries(properties).map(([name, schema]) => [name, resolveSchemaRefs(schemas, schema)]),
  );
}
