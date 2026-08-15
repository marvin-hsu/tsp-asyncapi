/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect } from "vitest";
import { Model } from "@typespec/compiler";
import { AsyncAPITester } from "../../../src/testing/index.js";
import { t } from "@typespec/compiler/testing";
import { SchemaBuilder } from "../../../src/builders/schemas/builder.js";
import { Ajv } from "ajv";

describe("Unit: Schemas — models, collections, and literals", () => {
  it("should omit `properties` for an empty model (omit-empty convention)", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { Empty } = await runner.compile(t.code`
      model ${t.model("Empty")} {}
    `);

    const builder = new SchemaBuilder(runner.program);
    builder.buildSchema(Empty);

    // Mirrors the `required` handling: empty fields are not emitted.
    expect(builder.getSchemas().Empty).toEqual({ type: "object" });
  });

  it("should build schema for intrinsic types", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { TestIntrinsics } = await runner.compile(t.code`
      model ${t.model("TestIntrinsics")} {
        n: null;
      }
    `);

    const builder = new SchemaBuilder(runner.program);
    builder.buildSchema(TestIntrinsics);

    const props = builder.getSchemas().TestIntrinsics.properties as Record<string, any>;
    expect(props.n).toEqual({ type: "null" });
  });

  it("should skip never-typed properties instead of emitting an unsatisfiable schema", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { M } = await runner.compile(t.code`
      model ${t.model("M")} {
        a: string;
        b: never;
        c?: never;
      }
    `);

    const builder = new SchemaBuilder(runner.program);
    builder.buildSchema(M);

    const schema = builder.getSchemas().M as any;
    // A required `{ not: {} }` property would make NO payload validate, so
    // never-typed properties must be omitted entirely (as openapi3 does).
    expect(Object.keys(schema.properties as Record<string, any>)).toEqual(["a"]);
    expect(schema.required).toEqual(["a"]);

    // Standalone `never` still maps to `{ not: {} }`. Only the
    // property-level path skips emitting it.
    const neverType = M.properties.get("b")?.type;
    expect(neverType).toBeDefined();
    if (neverType) {
      expect(builder.buildSchema(neverType)).toEqual({ not: {} });
    }
  });

  it("should build `{ not: {} }` for standalone `void`", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { doIt } = await runner.compile(t.code`
      op ${t.op("doIt")}(): void;
    `);

    const builder = new SchemaBuilder(runner.program);
    expect(builder.buildSchema(doIt.returnType)).toEqual({ not: {} });
  });

  it("should skip a property whose type is `never` via a template default (real-world never source)", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { M } = await runner.compile(t.code`
      model Env<T = never> {
        data: T;
      }
      model ${t.model("M")} {
        e: Env;
      }
    `);

    const builder = new SchemaBuilder(runner.program);
    builder.buildSchema(M);

    // `Env` instantiated (via `M.e`) with no explicit type argument still
    // has a `templateMapper` (its default, `never`). The
    // templateMapper-based naming strategy names it `EnvNever`. Its
    // `data: never` property must be omitted entirely (no `properties`,
    // no `required`).
    // Assert the full key set so an extra schema built from the
    // uninstantiated template *declaration* (a different `Model` object,
    // reachable only if something walks it separately) cannot slip in
    // silently.
    expect(Object.keys(builder.getSchemas())).toEqual(["EnvNever", "M"]);
    expect(builder.getSchemas().EnvNever).toEqual({ type: "object" });
  });

  it("should not register a bogus schema when handed an uninstantiated template declaration directly", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { Env } = await runner.compile(t.code`
      model ${t.model("Env")}<T = never> {
        data: T;
      }
    `);

    const builder = new SchemaBuilder(runner.program);
    // `Env` here is the template *declaration* itself (no
    // `templateMapper`), not an instantiation. Its `data` property's type
    // is a bare `TemplateParameter`, which has no real shape to build.
    // Building it anyway would emit a required-but-unconstrained `data`
    // property under a registered key. It must fall back to the
    // unconstrained schema instead, and must not register anything in
    // components.schemas.
    expect(builder.buildSchema(Env)).toEqual({});
    expect(builder.getSchemas()).toEqual({});
  });

  it("should not silently drop a model or property named `__proto__`", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { W } = await runner.compile(t.code`
      model \`__proto__\` { a: string; }
      model ${t.model("W")} {
        p: \`__proto__\`;
        \`__proto__\`: string;
      }
    `);

    const builder = new SchemaBuilder(runner.program);
    builder.buildSchema(W);

    const schemas = builder.getSchemas() as Record<string, any>;
    expect(Object.hasOwn(schemas, "__proto__")).toBe(true);
    // Dot notation is safe (not the `Object.prototype` accessor) because
    // `schemas` is null-prototype: this reads the plain own property.
    expect(schemas.__proto__).toEqual({
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
    });

    const wProps = schemas.W.properties as Record<string, any>;
    expect(Object.hasOwn(wProps, "__proto__")).toBe(true);
    expect(wProps.__proto__).toEqual({ type: "string" });
    expect(wProps.p).toEqual({ $ref: "#/components/schemas/__proto__" });
  });

  it("should build schema for arrays and records", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { TestCollections } = await runner.compile(t.code`
      model ${t.model("TestCollections")} {
        arr: string[];
        rec: Record<int32>;
      }
    `);

    const builder = new SchemaBuilder(runner.program);
    builder.buildSchema(TestCollections);

    const props = builder.getSchemas().TestCollections.properties as Record<string, any>;
    expect(props.arr).toEqual({ type: "array", items: { type: "string" } });
    expect(props.rec).toEqual({
      type: "object",
      additionalProperties: { type: "integer", format: "int32" },
    });
  });

  it("should register a named array/Record alias model in components.schemas instead of inlining it", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { M } = await runner.compile(t.code`
      model Names is string[];
      model Bag is Record<int32>;
      model ${t.model("M")} {
        a: Names;
        b: Names;
        c: Bag;
      }
    `);

    const builder = new SchemaBuilder(runner.program);
    builder.buildSchema(M);

    const components = builder.getSchemas();
    // A named `is` alias is a real declaration, not an anonymous literal:
    // it must be registered like any other named model, and both use sites
    // must $ref the same schema key instead of each getting an inline copy.
    expect(components.Names).toEqual({ type: "array", items: { type: "string" } });
    expect(components.Bag).toEqual({
      type: "object",
      additionalProperties: { type: "integer", format: "int32" },
    });

    const props = components.M.properties as Record<string, any>;
    expect(props.a).toEqual({ $ref: "#/components/schemas/Names" });
    expect(props.b).toEqual({ $ref: "#/components/schemas/Names" });
    expect(props.c).toEqual({ $ref: "#/components/schemas/Bag" });
  });

  it("should build schema for bare literal property types instead of the unconstrained {}", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { M } = await runner.compile(t.code`
      model ${t.model("M")} {
        lit: "active";
        n: 42;
        flag: true;
      }
    `);

    const builder = new SchemaBuilder(runner.program);
    builder.buildSchema(M);

    const props = builder.getSchemas().M.properties as Record<string, any>;
    // `enum` is used uniformly for literals and enums (one code path for
    // 2.6); it constrains the schema instead of accepting any value.
    expect(props.lit).toEqual({ type: "string", enum: ["active"] });
    expect(props.n).toEqual({ type: "number", enum: [42] });
    expect(props.flag).toEqual({ type: "boolean", enum: [true] });
  });

  it("inlines an anonymous-model template argument with a backtick-quoted property name, using its raw property name as the schema property key", async () => {
    // The anonymous-model argument has no fixed identity of its own to
    // name the instantiation after, so it inlines instead of registering
    // a synthesized `components.schemas` key. A schema property key can be
    // any string, unlike a `components.schemas` key, so the
    // backtick-quoted name passes through unsanitized.
    const runner = await AsyncAPITester.createInstance();
    const { M } = await runner.compile(t.code`
      model P<T> { v: T; }
      @test("M")
      model M { a: P<{ \`x/y\`: string }>; }
    `);
    const builder = new SchemaBuilder(runner.program);
    builder.buildSchema(M as Model);
    const components = builder.getSchemas();
    const props = components.M.properties as Record<string, any>;

    expect(props.a).toEqual({
      type: "object",
      properties: {
        v: { type: "object", properties: { "x/y": { type: "string" } }, required: ["x/y"] },
      },
      required: ["v"],
    });
    expect(Object.keys(components)).toEqual(["M"]);
  });

  it("should use the @encodedName('application/json', ...) name as the schema property key", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { M } = await runner.compile(t.code`
      @test("M")
      model M {
        @encodedName("application/json", "user_name")
        userName: string;
      }
    `);

    const builder = new SchemaBuilder(runner.program);
    builder.buildSchema(M as Model);
    const schema = builder.getSchemas().M as any;

    expect(schema.properties.user_name).toEqual({ type: "string" });
    expect(schema.properties.userName).toBeUndefined();
    expect(schema.required).toEqual(["user_name"]);
  });

  it("should produce a valid schema for a complex model combining nesting, union, enum, and validation decorators", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { Order } = await runner.compile(t.code`
      enum Status {
        Pending,
        Shipped,
        Delivered,
      }
      model Address {
        city: string;
        zip?: string;
      }
      @test("Order")
      model Order {
        @minLength(1)
        @maxLength(64)
        id: string;

        status: Status;

        shipTo: Address;

        @minValue(0)
        total: float64;

        tags: string[];

        contact: string | int32;

        note?: string;
      }
    `);

    const builder = new SchemaBuilder(runner.program);
    builder.buildSchema(Order as Model);
    const components = builder.getSchemas();
    const schema = components.Order as any;

    expect(schema.type).toBe("object");
    // This is an exact match, not `arrayContaining`. A regression that
    // puts the optional `note` field into `required` must fail this
    // assertion.
    expect(schema.required).toEqual(["id", "status", "shipTo", "total", "tags", "contact"]);
    expect(schema.properties.id).toEqual({
      type: "string",
      minLength: 1,
      maxLength: 64,
    });
    expect(schema.properties.status).toEqual({ $ref: "#/components/schemas/Status" });
    expect(components.Status).toEqual({
      type: "string",
      enum: ["Pending", "Shipped", "Delivered"],
    });
    expect(schema.properties.shipTo).toEqual({ $ref: "#/components/schemas/Address" });
    expect(components.Address).toEqual({
      type: "object",
      properties: {
        city: { type: "string" },
        zip: { type: "string" },
      },
      required: ["city"],
    });
    expect(schema.properties.total).toEqual({
      type: "number",
      format: "double",
      minimum: 0,
    });
    expect(schema.properties.tags).toEqual({
      type: "array",
      items: { type: "string" },
    });
    expect(schema.properties.contact).toEqual({
      anyOf: [{ type: "string" }, { type: "integer", format: "int32" }],
    });
    expect(schema.properties.note).toEqual({ type: "string" });

    // Actually run the assembled components through a real draft-07
    // validator. A `toEqual` shape assertion alone cannot catch a
    // regression that produces a shape-correct but schema-invalid
    // document (e.g. `enum: []`/`anyOf: []`).
    const ajv = new Ajv({ strict: false });
    for (const [key, componentSchema] of Object.entries(components)) {
      ajv.addSchema(componentSchema, `#/components/schemas/${key}`);
    }
    const validate = ajv.getSchema("#/components/schemas/Order");
    expect(validate).toBeDefined();
    if (validate === undefined) {
      throw new Error("unreachable: asserted above");
    }

    expect(
      validate({
        id: "abc",
        status: "Pending",
        shipTo: { city: "Taipei" },
        total: 12.5,
        tags: ["a", "b"],
        contact: "someone",
      }),
    ).toBe(true);

    // Violates both `minLength(1)` (empty id) and `minValue(0)` (negative
    // total).
    expect(
      validate({
        id: "",
        status: "Pending",
        shipTo: { city: "Taipei" },
        total: -5,
        tags: ["a"],
        contact: 1,
      }),
    ).toBe(false);
  });
});
