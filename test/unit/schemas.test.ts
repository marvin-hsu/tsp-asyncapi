/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, vi } from "vitest";
import { AsyncAPITester } from "../../src/testing/index.js";
import { t, TemplateWithMarkers } from "@typespec/compiler/testing";
import { SchemaBuilder } from "../../src/builders/schemas.js";
import { Entity, Model } from "@typespec/compiler";

/**
 * Compiles `code` (which must produce a model named `M`) and immediately
 * builds its schema, returning the builder alongside the full compile
 * result (so a test needing other destructured symbols, e.g. `program`,
 * can still reach them). Shared across the "documentation (2.7)" tests
 * below, which otherwise all repeat the same four-line create-instance /
 * compile / new-builder / build-schema setup.
 */
async function buildDocSchema<T extends Record<string, Entity> & { M: Model }>(
  code: TemplateWithMarkers<T>,
) {
  const runner = await AsyncAPITester.createInstance();
  const result = await runner.compile(code);
  const builder = new SchemaBuilder(runner.program);
  builder.buildSchema(result.M);
  return { builder, runner, ...result };
}

describe("Unit: Schemas (Phase 2)", () => {
  describe("buildSchema", () => {
    it("should build string scalar schema", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { TestModel } = await runner.compile(t.code`
        model ${t.model("TestModel")} {
          field: string;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      const schema = builder.buildSchema(TestModel) as any;

      expect(schema.$ref).toBe("#/components/schemas/TestModel");

      const components = builder.getSchemas();
      expect(components.TestModel).toBeDefined();
      expect(components.TestModel.type).toBe("object");
      expect(components.TestModel.properties?.field).toEqual({ type: "string" });
      expect(components.TestModel.required).toEqual(["field"]);
    });

    it("should build schema for various scalars", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { TestScalars } = await runner.compile(t.code`
        model ${t.model("TestScalars")} {
          str: string;
          bool: boolean;
          num8: int8;
          num16: int16;
          num32: int32;
          num64: int64;
          safeNum: safeint;
          u8: uint8;
          u16: uint16;
          u32: uint32;
          u64: uint64;
          f32: float32;
          f64: float64;
          decVal: decimal;
          dec128: decimal128;
          date: plainDate;
          time: plainTime;
          utc: utcDateTime;
          offset: offsetDateTime;
          dur: duration;
          uri: url;
          b: bytes;
          unknownField: unknown;
          i: integer;
          f: float;
          n: numeric;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(TestScalars);

      const props = builder.getSchemas().TestScalars.properties as Record<string, any>;
      expect(props.str).toEqual({ type: "string" });
      expect(props.bool).toEqual({ type: "boolean" });
      expect(props.num8).toEqual({ type: "integer", format: "int8" });
      expect(props.num16).toEqual({ type: "integer", format: "int16" });
      expect(props.num32).toEqual({ type: "integer", format: "int32" });
      expect(props.num64).toEqual({ type: "integer", format: "int64" });
      expect(props.safeNum).toEqual({ type: "integer", format: "int64" });
      expect(props.u8).toEqual({ type: "integer", format: "uint8" });
      expect(props.u16).toEqual({ type: "integer", format: "uint16" });
      expect(props.u32).toEqual({ type: "integer", format: "uint32" });
      expect(props.u64).toEqual({ type: "integer", format: "uint64" });
      expect(props.f32).toEqual({ type: "number", format: "float" });
      expect(props.f64).toEqual({ type: "number", format: "double" });
      expect(props.decVal).toEqual({ type: "number", format: "decimal" });
      expect(props.dec128).toEqual({ type: "number", format: "decimal128" });
      expect(props.date).toEqual({ type: "string", format: "date" });
      expect(props.time).toEqual({ type: "string", format: "time" });
      expect(props.utc).toEqual({ type: "string", format: "date-time" });
      expect(props.offset).toEqual({ type: "string", format: "date-time" });
      expect(props.dur).toEqual({ type: "string", format: "duration" });
      expect(props.uri).toEqual({ type: "string", format: "uri" });
      expect(props.b).toEqual({ type: "string", format: "byte" });
      expect(props.unknownField).toEqual({});
      // Abstract numeric scalars have no specified width, so no `format`.
      expect(props.i).toEqual({ type: "integer" });
      expect(props.f).toEqual({ type: "number" });
      expect(props.n).toEqual({ type: "number" });
    });

    it("should resolve user-declared scalars via the baseScalar chain", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        scalar Email extends string;
        scalar Age extends int32;
        scalar Opaque;
        model ${t.model("M")} {
          e: Email;
          a: Age;
          o: Opaque;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      // Derived scalars fall back to their base scalar's mapping.
      expect(props.e).toEqual({ type: "string" });
      expect(props.a).toEqual({ type: "integer", format: "int32" });
      // An unmapped root scalar has no known value shape: emit the
      // unconstrained schema (same as `unknown`), never a guessed primitive.
      expect(props.o).toEqual({});
    });

    it("should not let a user scalar shadowed by a built-in name hijack the built-in mapping", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        namespace MyLib {
          scalar duration extends int32;
          scalar url extends int64;
        }
        model ${t.model("M")} {
          d: MyLib.duration;
          u: MyLib.url;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      // These names collide with built-in `duration`/`url`, but these are
      // user-declared scalars in `MyLib`, not the TypeSpec built-ins — they
      // must resolve via their own baseScalar chain, not the lookup table.
      expect(props.d).toEqual({ type: "integer", format: "int32" });
      expect(props.u).toEqual({ type: "integer", format: "int64" });
    });

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

    it("should build schema for intrinsic types (plan 2.2 null row)", async () => {
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

      // Standalone `never` keeps the plan 2.2 mapping: nothing matches
      // `{ not: {} }`. Only the property-level path skips it.
      const neverType = M.properties.get("b")?.type;
      expect(neverType).toBeDefined();
      if (neverType) {
        expect(builder.buildSchema(neverType)).toEqual({ not: {} });
      }
    });

    it("should build `{ not: {} }` for standalone `void` (plan 2.2)", async () => {
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

      // `Env` instantiated (via `M.e`) with no type argument gets
      // `data: never`, which must be omitted entirely (no `properties`, no
      // `required`). Assert the full key set so an extra schema built from
      // the uninstantiated template *declaration* (a different `Model`
      // object, reachable only if something walks it separately) cannot
      // slip in silently.
      expect(Object.keys(builder.getSchemas())).toEqual(["Env", "M"]);
      expect(builder.getSchemas().Env).toEqual({ type: "object" });
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
      // is a bare `TemplateParameter`, which has no real shape to build —
      // building it anyway would emit a required-but-unconstrained `data`
      // property under a registered key. Must fall back to the unconstrained
      // schema instead, and must not register anything in components.schemas.
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

    it("should escape `/` and `~` in schema keys when building `$ref` (RFC 6901)", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model \`x/y\` { z: string; }
        model \`a~b\` { z: string; }
        model ${t.model("M")} {
          q: \`x/y\`;
          r: \`a~b\`;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M);

      const components = builder.getSchemas() as Record<string, any>;
      // The raw (unescaped) key is still used to store the schema itself.
      expect(Object.hasOwn(components, "x/y")).toBe(true);
      expect(Object.hasOwn(components, "a~b")).toBe(true);

      const props = components.M.properties as Record<string, any>;
      // But the `$ref` string must escape per RFC 6901 (`~` -> `~0` before
      // `/` -> `~1`), or a conforming resolver misreads `x/y` as a path
      // through nested objects `x`.`y`.
      expect(props.q).toEqual({ $ref: "#/components/schemas/x~1y" });
      expect(props.r).toEqual({ $ref: "#/components/schemas/a~0b" });
    });

    it("should escape `/` produced by the qualified-name fallback for a `/`-containing namespace", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { NsFoo, GlobalFoo } = await runner.compile(t.code`
        namespace \`a/b\` {
          @test("NsFoo")
          model Foo { x: string; }
        }
        @test("GlobalFoo")
        model Foo { z: string; }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(GlobalFoo as Model);
      const ref2 = builder.buildSchema(NsFoo as Model) as any;

      // Qualified name is `a/b.Foo`; the `/` inside it must be escaped too.
      expect(ref2.$ref).toBe("#/components/schemas/a~1b.Foo");
      const components = builder.getSchemas();
      expect(Object.hasOwn(components, "a/b.Foo")).toBe(true);
    });

    it("should build `model B extends A` as `allOf: [{ $ref: A }, own]`, registering both models (plan 2.9)", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Derived } = await runner.compile(t.code`
        model Base { a: string; }
        model ${t.model("Derived")} extends Base { b: int32; }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Derived);

      const components = builder.getSchemas();
      // `Derived`'s own declared properties (`b`) are layered as a sibling to
      // a `$ref` back to `Base` — `Base` is registered too, rather than its
      // properties being inlined/duplicated into `Derived`.
      expect(components.Base).toEqual({
        type: "object",
        properties: { a: { type: "string" } },
        required: ["a"],
      });
      expect(components.Derived).toEqual({
        allOf: [
          { $ref: "#/components/schemas/Base" },
          {
            type: "object",
            properties: { b: { type: "integer", format: "int32" } },
            required: ["b"],
          },
        ],
      });
    });

    it("should flatten spread (`...A`) properties directly onto the spreading model, not via `allOf`", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model Base { a: string; }
        model ${t.model("M")} { ...Base; b: int32; }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M);

      const components = builder.getSchemas();
      // TypeSpec's own spread semantics already copy `Base`'s members onto
      // `M` at the type level (`model.properties` includes them directly, no
      // `baseModel` link is created) — so this is the same plain-object
      // shape a model with those two properties declared directly would get,
      // with no `allOf`/`$ref` involved and no separate `Base` registered.
      expect(Object.keys(components)).toEqual(["M"]);
      expect(components.M).toEqual({
        type: "object",
        properties: { a: { type: "string" }, b: { type: "integer", format: "int32" } },
        required: ["a", "b"],
      });
    });

    it("should emit `discriminator` (a bare property-name string) on a `@discriminator`-annotated base model", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Pet, Cat, Dog } = await runner.compile(t.code`
        @discriminator("kind")
        model ${t.model("Pet")} { kind: string; }
        model ${t.model("Cat")} extends Pet { kind: "cat"; lives: int32; }
        model ${t.model("Dog")} extends Pet { kind: "dog"; }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Pet);
      builder.buildSchema(Cat);
      builder.buildSchema(Dog);

      const components = builder.getSchemas();
      expect(components.Pet).toEqual({
        type: "object",
        properties: { kind: { type: "string" } },
        required: ["kind"],
        discriminator: "kind",
      });
      expect(components.Cat).toEqual({
        allOf: [
          { $ref: "#/components/schemas/Pet" },
          {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["cat"] },
              lives: { type: "integer", format: "int32" },
            },
            required: ["kind", "lives"],
          },
        ],
      });
      expect(components.Dog).toEqual({
        allOf: [
          { $ref: "#/components/schemas/Pet" },
          {
            type: "object",
            properties: { kind: { type: "string", enum: ["dog"] } },
            required: ["kind"],
          },
        ],
      });
    });

    it("should hoist discriminator to the schema root even when the @discriminator-annotated model itself has a baseModel (plan 2.9)", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Pet, Dog, Poodle } = await runner.compile(t.code`
        @discriminator("kind")
        model ${t.model("Pet")} { kind: string; }
        @discriminator("breed")
        model ${t.model("Dog")} extends Pet { kind: "dog"; breed: string; }
        model ${t.model("Poodle")} extends Dog { breed: "poodle"; }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Pet);
      builder.buildSchema(Dog);
      builder.buildSchema(Poodle);

      const components = builder.getSchemas();
      // `Dog` has its own baseModel (`Pet`) *and* its own `@discriminator`.
      // `discriminator` must sit at the schema root, alongside `allOf` — not
      // buried inside `allOf`'s second (own-shape) branch, where no AsyncAPI
      // 3.x consumer would ever look for it.
      expect(components.Dog).toMatchObject({ discriminator: "breed" });
      expect((components.Dog as any).allOf).toBeDefined();
      expect((components.Dog as any).discriminator).toBe("breed");
    });

    it("should report a diagnostic and omit discriminator when the discriminating property does not exist on the model", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Pet } = await runner.compile(t.code`
        @discriminator("kind")
        model ${t.model("Pet")} { name: string; }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Pet);

      const components = builder.getSchemas();
      expect((components.Pet as any).discriminator).toBeUndefined();
      expect(
        runner.program.diagnostics.some(
          (d) => d.code === "typespec-asyncapi/missing-discriminator-property",
        ),
      ).toBe(true);
    });

    it("should report a diagnostic and omit discriminator when the discriminating property is optional", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Pet } = await runner.compile(t.code`
        @discriminator("kind")
        model ${t.model("Pet")} { kind?: string; }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Pet);

      const components = builder.getSchemas();
      expect((components.Pet as any).discriminator).toBeUndefined();
      expect(
        runner.program.diagnostics.some(
          (d) => d.code === "typespec-asyncapi/optional-discriminator-property",
        ),
      ).toBe(true);
    });

    it("should match the discriminating property by its TypeSpec name and emit the wire name as discriminator", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Pet } = await runner.compile(t.code`
        @discriminator("kind")
        model ${t.model("Pet")} {
          @encodedName("application/json", "petType")
          kind: string;
          name: string;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Pet);

      const components = builder.getSchemas();
      expect(components.Pet).toEqual({
        type: "object",
        properties: {
          petType: { type: "string" },
          name: { type: "string" },
        },
        required: ["petType", "name"],
        discriminator: "petType",
      });
      expect(
        runner.program.diagnostics.some(
          (d) => d.code === "typespec-asyncapi/missing-discriminator-property",
        ),
      ).toBe(false);
    });

    it("should emit discriminator when the discriminating property is inherited from baseModel", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Mid } = await runner.compile(t.code`
        model Base { kind: string; }
        @discriminator("kind")
        model ${t.model("Mid")} extends Base { name: string; }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Mid);

      const components = builder.getSchemas();
      expect(components.Mid).toEqual({
        allOf: [
          { $ref: "#/components/schemas/Base" },
          {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
          },
        ],
        discriminator: "kind",
      });
    });

    it("should report a diagnostic and omit discriminator when the discriminating property is never-typed", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Pet } = await runner.compile(t.code`
        @discriminator("kind")
        model ${t.model("Pet")} { kind: never; name: string; }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Pet);

      const components = builder.getSchemas();
      expect((components.Pet as any).discriminator).toBeUndefined();
      expect(
        runner.program.diagnostics.some(
          (d) => d.code === "typespec-asyncapi/missing-discriminator-property",
        ),
      ).toBe(true);
    });

    it("should preserve a named collection-backed base's validation keywords and docs when extended", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Pets } = await runner.compile(t.code`
        @doc("names doc")
        @minItems(1)
        model Names is string[];
        model ${t.model("Pets")} extends Names {}
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Pets);

      const components = builder.getSchemas();
      expect(components.Pets).toEqual({
        allOf: [{ $ref: "#/components/schemas/Names" }],
      });
      expect(components.Names).toEqual({
        type: "array",
        items: { type: "string" },
        description: "names doc",
        minItems: 1,
      });
    });

    it("should return the base's collection shape (not an unsatisfiable allOf) when extends an array-backed model", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Pets } = await runner.compile(t.code`
        model Pet { name: string; }
        model ${t.model("Pets")} extends Array<Pet> { }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Pets);

      const components = builder.getSchemas();
      expect(components.Pets).toEqual({
        type: "array",
        items: { $ref: "#/components/schemas/Pet" },
      });
    });

    it("should return the base's collection shape (not a noisy allOf) when extends a record-backed model", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Bag } = await runner.compile(t.code`
        model ${t.model("Bag")} extends Record<string> { }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Bag);

      const components = builder.getSchemas();
      expect(components.Bag).toEqual({
        type: "object",
        additionalProperties: { type: "string" },
      });
    });

    it("should keep own properties when extending an anonymous Record base", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Bag } = await runner.compile(t.code`
        model ${t.model("Bag")} extends Record<unknown> { count: int32; name: string; }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Bag);

      const components = builder.getSchemas();
      expect(components.Bag).toEqual({
        type: "object",
        additionalProperties: {},
        properties: {
          count: { type: "integer", format: "int32" },
          name: { type: "string" },
        },
        required: ["count", "name"],
      });
    });

    it("should keep own properties when extending a named Record-backed alias", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Bag } = await runner.compile(t.code`
        model Props is Record<unknown>;
        model ${t.model("Bag")} extends Props { count: int32; }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Bag);

      const components = builder.getSchemas();
      expect(components.Bag).toEqual({
        allOf: [
          { $ref: "#/components/schemas/Props" },
          {
            type: "object",
            properties: { count: { type: "integer", format: "int32" } },
            required: ["count"],
          },
        ],
      });
    });

    it("should keep own properties when extending a Record<string> base with a compatible property type", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Bag } = await runner.compile(t.code`
        model ${t.model("Bag")} extends Record<string> { extra: string; }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Bag);

      const components = builder.getSchemas();
      expect(components.Bag).toEqual({
        type: "object",
        additionalProperties: { type: "string" },
        properties: { extra: { type: "string" } },
        required: ["extra"],
      });
    });

    it("should keep own properties when a model has its own declared property plus a spread Record indexer (no extends)", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Bag } = await runner.compile(t.code`
        model ${t.model("Bag")} { id: string; ...Record<string>; }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Bag);

      const components = builder.getSchemas();
      expect(components.Bag).toEqual({
        type: "object",
        additionalProperties: { type: "string" },
        properties: { id: { type: "string" } },
        required: ["id"],
      });
    });

    it("should keep both the base's properties and a spread Record indexer when a model extends and spreads", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { D, program } = await runner.compile(t.code`
        model ${t.model("Base")} { a: string; }
        model ${t.model("D")} extends Base { ...Record<string>; }
      `);

      const builder = new SchemaBuilder(program);
      const schema = builder.buildSchema(D) as any;

      const components = builder.getSchemas();
      expect(schema).toEqual({ $ref: "#/components/schemas/D" });
      expect(components.Base).toEqual({
        type: "object",
        properties: { a: { type: "string" } },
        required: ["a"],
      });
      expect(components.D).toEqual({
        allOf: [
          { $ref: "#/components/schemas/Base" },
          { type: "object", additionalProperties: { type: "string" } },
        ],
      });
    });

    it("should emit properties/required/discriminator together when the discriminating property survives a Record base", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Bag } = await runner.compile(t.code`
        @discriminator("kind")
        model ${t.model("Bag")} extends Record<string> { kind: string; }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Bag);

      const components = builder.getSchemas();
      expect(components.Bag).toEqual({
        type: "object",
        additionalProperties: { type: "string" },
        properties: { kind: { type: "string" } },
        required: ["kind"],
        discriminator: "kind",
      });
    });

    it("should keep discriminator on the assembled schema when the discriminating property is inherited from an allOf branch (documented lenient interpretation)", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Mid } = await runner.compile(t.code`
        model Base { kind: string; }
        @discriminator("kind")
        model ${t.model("Mid")} extends Base { }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Mid);

      const components = builder.getSchemas();
      expect(components.Mid).toEqual({
        allOf: [{ $ref: "#/components/schemas/Base" }],
        discriminator: "kind",
      });
    });

    it("should omit the empty own-shape branch when a derived model adds no properties of its own", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Derived } = await runner.compile(t.code`
        model Base { a: string; }
        model ${t.model("Derived")} extends Base { }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Derived);

      const components = builder.getSchemas();
      expect(components.Derived).toEqual({
        allOf: [{ $ref: "#/components/schemas/Base" }],
      });
    });

    it("should flatten (not allOf) a derived model whose override property has a different @encodedName than the inherited one (review 2026-08-14-94)", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Cat } = await runner.compile(t.code`
        model Pet { kind: string; }
        model ${t.model("Cat")} extends Pet {
          @encodedName("application/json", "k")
          kind: "cat";
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Cat);

      const components = builder.getSchemas();
      // The flattened schema must be keyed entirely by the actual (winning)
      // wire name `k` — no stale `allOf` branch left requiring the base's
      // `kind` key, which `Cat`'s wire payload never carries.
      expect(components.Cat).toEqual({
        type: "object",
        properties: { k: { type: "string", enum: ["cat"] } },
        required: ["k"],
      });
      const overrideDiagnostic = runner.program.diagnostics.find(
        (d) => d.code === "typespec-asyncapi/encoded-name-override-conflict",
      );
      expect(overrideDiagnostic).toBeDefined();
      // The message must describe *this* case (an override diverging from
      // its ancestor's wire name), not the unrelated-collision case.
      expect(String(overrideDiagnostic?.message)).toMatch(
        /overrides an inherited property but resolves to a different wire name/,
      );
    });

    it("should flatten (not allOf) a derived model whose new property's wire name collides with a different inherited property's wire name (review 2026-08-14-97)", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Derived } = await runner.compile(t.code`
        model Base { a: string; }
        model ${t.model("Derived")} extends Base {
          @encodedName("application/json", "a")
          b: int32;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Derived);

      const components = builder.getSchemas();
      // Must not be an unsatisfiable `allOf` requiring `a` to be both a
      // string (Base branch) and an integer (own branch) at once.
      expect(components.Derived).toEqual({
        type: "object",
        properties: { a: { type: "integer", format: "int32" } },
        required: ["a"],
      });
      const collisionDiagnostic = runner.program.diagnostics.find(
        (d) => d.code === "typespec-asyncapi/encoded-name-override-conflict",
      );
      expect(collisionDiagnostic).toBeDefined();
      // The message must describe *this* case (an unrelated wire-name
      // collision), not the diverging-override case.
      expect(String(collisionDiagnostic?.message)).toMatch(
        /resolves to the same wire name .* as a different, unrelated inherited property/,
      );
    });

    it("should keep an inherited Record indexer's additionalProperties when the flatten fallback triggers", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Derived } = await runner.compile(t.code`
        model Base extends Record<string> {
          @encodedName("application/json", "x")
          a: string;
        }
        model ${t.model("Derived")} extends Base {
          @encodedName("application/json", "y")
          a: string;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Derived);

      const components = builder.getSchemas();
      // The flattened schema must still carry Base's `additionalProperties`
      // constraint (via its Record indexer) alongside the flattened `y`
      // property — losing it would let a payload with a non-string extra
      // property validate even though Base's indexer forbids it.
      expect(components.Derived).toEqual({
        type: "object",
        additionalProperties: { type: "string" },
        properties: { y: { type: "string" } },
        required: ["y"],
      });
    });

    it("should drop a `never`-typed override of an inherited property under `extends`, matching the flatten fallback's behavior (review 2026-08-14-98)", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Derived } = await runner.compile(t.code`
        model Base { a: string; b: string; }
        model ${t.model("Derived")} extends Base { a: never; }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Derived);

      const components = builder.getSchemas();
      // `a` must not be required/present on the effective schema: a
      // `never`-typed override means "this property does not exist", and
      // must not still be forced by a stale `allOf` branch onto `Base`.
      expect(components.Derived).toEqual({
        type: "object",
        properties: { b: { type: "string" } },
        required: ["b"],
      });
      expect(
        runner.program.diagnostics.some(
          (d) => d.code === "typespec-asyncapi/never-typed-property-override",
        ),
      ).toBe(true);
    });

    it("should report missing-discriminator-property when @discriminator is applied to a collection-backed model (review 2026-08-14-95)", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Names } = await runner.compile(t.code`
        @discriminator("kind")
        model ${t.model("Names")} is string[];
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Names);

      const components = builder.getSchemas();
      expect((components.Names as any).discriminator).toBeUndefined();
      expect(
        runner.program.diagnostics.some(
          (d) => d.code === "typespec-asyncapi/missing-discriminator-property",
        ),
      ).toBe(true);
    });

    it("should emit a plain anyOf for a @discriminated union, not yet reflecting its envelope semantics (plan 2.9, known gap)", async () => {
      // Known, documented gap (plan/03-schemas.md 2.9): the newer
      // `@discriminated` union decorator (envelope: "object" by default) is
      // not yet supported — this pins the current (incomplete) `anyOf`
      // output so the gap cannot silently regress into looking "supported"
      // without anyone noticing. The real wire shape for `envelope: "object"`
      // is `{ "kind": "a", "value": { ... } }`, which does NOT validate
      // against this schema; full envelope support is deferred to a future
      // phase per plan/03-schemas.md.
      const runner = await AsyncAPITester.createInstance();
      const { U } = await runner.compile(t.code`
        model A { kind: "a"; }
        model B { kind: "b"; }
        @discriminated
        union ${t.union("U")} { a: A, b: B }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(U);

      const components = builder.getSchemas();
      expect(components.U).toEqual({
        anyOf: [{ $ref: "#/components/schemas/A" }, { $ref: "#/components/schemas/B" }],
      });
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

    it("should qualify colliding model names from different namespaces", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Type1, Type2, program } = await runner.compile(t.code`
        namespace NS1 {
          @test("Type1")
          model Duplicate1 {
            field1: string;
          }
        }
        namespace NS2 {
          @test("Type2")
          model Duplicate1 {
            field2: int32;
          }
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      const ref1 = builder.buildSchema(Type1 as Model) as any;
      const ref2 = builder.buildSchema(Type2 as Model) as any;

      // First model keeps the bare name; the later collider gets the
      // dot-separated fully qualified name.
      expect(ref1.$ref).toBe("#/components/schemas/Duplicate1");
      expect(ref2.$ref).toBe("#/components/schemas/NS2.Duplicate1");

      const components = builder.getSchemas();
      expect(components.Duplicate1).toBeDefined();
      expect(components.Duplicate1.properties?.field1).toEqual({ type: "string" });
      expect(components["NS2.Duplicate1"]).toBeDefined();
      expect(components["NS2.Duplicate1"].properties?.field2).toEqual({
        type: "integer",
        format: "int32",
      });

      // The rename policy needs no diagnostic.
      expect(program.diagnostics).toHaveLength(0);
    });

    it("should disambiguate a global-namespace model colliding with a namespaced one (namespaced first)", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { NsFoo, GlobalFoo, program } = await runner.compile(t.code`
        namespace NS2 {
          @test("NsFoo")
          model Foo {
            a: string;
          }
        }
        @test("GlobalFoo")
        model Foo {
          b: int32;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      const ref1 = builder.buildSchema(NsFoo as Model) as any;
      const ref2 = builder.buildSchema(GlobalFoo as Model) as any;

      // The global model's qualified name equals its bare name, so it must
      // fall through to the documented fallback: qualified name + numeric
      // suffix starting at 2 (plan 2.1).
      expect(ref1.$ref).toBe("#/components/schemas/Foo");
      expect(ref2.$ref).toBe("#/components/schemas/Foo_2");

      const components = builder.getSchemas();
      expect(components.Foo.properties?.a).toEqual({ type: "string" });
      expect(components.Foo_2).toBeDefined();
      expect(components.Foo_2.properties?.b).toEqual({ type: "integer", format: "int32" });
      expect(program.diagnostics).toHaveLength(0);
    });

    it("should disambiguate a global-namespace model colliding with a namespaced one (global first)", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { NsFoo, GlobalFoo } = await runner.compile(t.code`
        namespace NS2 {
          @test("NsFoo")
          model Foo {
            a: string;
          }
        }
        @test("GlobalFoo")
        model Foo {
          b: int32;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      const ref1 = builder.buildSchema(GlobalFoo as Model) as any;
      const ref2 = builder.buildSchema(NsFoo as Model) as any;

      expect(ref1.$ref).toBe("#/components/schemas/Foo");
      expect(ref2.$ref).toBe("#/components/schemas/NS2.Foo");

      const components = builder.getSchemas();
      expect(components.Foo.properties?.b).toEqual({ type: "integer", format: "int32" });
      expect(components["NS2.Foo"].properties?.a).toEqual({ type: "string" });
    });

    it("should give each template instantiation its own schema key", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { W } = await runner.compile(t.code`
        namespace NS {
          model Page<T> {
            items: T[];
          }
          @test("W")
          model W {
            a: Page<string>;
            b: Page<int32>;
            c: Page<boolean>;
          }
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(W as Model);

      const components = builder.getSchemas();
      const props = components.W.properties as Record<string, any>;
      const refs = [props.a.$ref, props.b.$ref, props.c.$ref] as string[];
      // Every instantiation of Page<T> shares one name in one namespace, so
      // each must be disambiguated to its own key. Pin the exact fallback
      // ladder from plan 2.1: bare name → qualified name → qualified name
      // with a numeric suffix starting at 2.
      expect(refs).toEqual([
        "#/components/schemas/Page",
        "#/components/schemas/NS.Page",
        "#/components/schemas/NS.Page_2",
      ]);

      const itemTypes = refs.map((ref) => {
        const key = ref.replace("#/components/schemas/", "");
        const schema = components[key] as any;
        return schema.properties.items.items.type as string;
      });
      expect(itemTypes).toEqual(["string", "integer", "boolean"]);
    });

    it("should qualify with the full multi-level namespace chain", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { GlobalModel, NestedModel } = await runner.compile(t.code`
        @test("GlobalModel")
        model Widget {
          a: string;
        }
        namespace Foo {
          namespace Bar {
            @test("NestedModel")
            model Widget {
              b: int32;
            }
          }
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      const ref1 = builder.buildSchema(GlobalModel as Model) as any;
      const ref2 = builder.buildSchema(NestedModel as Model) as any;

      // The qualified name walks the whole namespace chain, outermost first
      // (plan 2.1's literal example), not just the innermost namespace.
      expect(ref1.$ref).toBe("#/components/schemas/Widget");
      expect(ref2.$ref).toBe("#/components/schemas/Foo.Bar.Widget");

      const components = builder.getSchemas();
      expect(components["Foo.Bar.Widget"].properties?.b).toEqual({
        type: "integer",
        format: "int32",
      });
    });

    it("should keep a stable $ref when a renamed model is referenced again", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Type1, Type2, Wrapper } = await runner.compile(t.code`
        namespace NS1 {
          @test("Type1")
          model Duplicate1 {
            field1: string;
          }
        }
        namespace NS2 {
          @test("Type2")
          model Duplicate1 {
            field2: int32;
          }
          @test("Wrapper")
          model Wrapper {
            inner: Duplicate1;
          }
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Type1 as Model);
      builder.buildSchema(Type2 as Model);
      builder.buildSchema(Wrapper as Model);

      const components = builder.getSchemas();
      expect(components.Wrapper.properties?.inner).toEqual({
        $ref: "#/components/schemas/NS2.Duplicate1",
      });
    });

    it("pins that bare-name ownership between colliding models depends on referencing-property order, not source order", async () => {
      // Known, accepted limitation of the lazy key policy (plan 2.1): which
      // colliding model keeps the bare name is decided by which one is
      // *visited* first while walking a referencing model's properties, not
      // by namespace or declaration order. Reordering W's properties below
      // (with neither `Foo` declaration touched) flips who gets the bare
      // name — this test pins the current behaviour so a future change to
      // it is deliberate rather than accidental.
      const runner = await AsyncAPITester.createInstance();
      const { W } = await runner.compile(t.code`
        namespace NS1 { model Foo { a: string; } }
        namespace NS2 { model Foo { b: int32; } }
        model ${t.model("W")} {
          x: NS2.Foo;
          y: NS1.Foo;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(W);

      const props = builder.getSchemas().W.properties as Record<string, any>;
      // `x` (NS2.Foo) is visited first, so it claims the bare name.
      expect(props.x).toEqual({ $ref: "#/components/schemas/Foo" });
      expect(props.y).toEqual({ $ref: "#/components/schemas/NS1.Foo" });
    });
  });

  describe("enum and union (plan 2.6)", () => {
    it("should build a string enum from unvalued members, using each member's own name as its value", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Color } = await runner.compile(t.code`
        enum ${t.enum("Color")} { Red, Green }
      `);

      const builder = new SchemaBuilder(runner.program);
      const ref = builder.buildSchema(Color) as any;

      expect(ref.$ref).toBe("#/components/schemas/Color");
      expect(builder.getSchemas().Color).toEqual({
        type: "string",
        enum: ["Red", "Green"],
      });
    });

    it("should use explicit string values instead of member names", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Color } = await runner.compile(t.code`
        enum ${t.enum("Color")} { Red: "R", Green: "G" }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Color);

      expect(builder.getSchemas().Color).toEqual({
        type: "string",
        enum: ["R", "G"],
      });
    });

    it("should build a number enum when every member has a numeric value", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Status } = await runner.compile(t.code`
        enum ${t.enum("Status")} { Active: 1, Inactive: 2 }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Status);

      expect(builder.getSchemas().Status).toEqual({
        type: "number",
        enum: [1, 2],
      });
    });

    it("should fall back to a string enum when a mix of numeric and unvalued/string members appear", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Mixed } = await runner.compile(t.code`
        enum ${t.enum("Mixed")} { Active: 1, Other }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Mixed);

      // `type: "string"` would make the numeric member `1` unsatisfiable
      // (see plan/review/solved/2026-08-14-35-mixed-enum-type-excludes-numeric-values.md) —
      // omit `type` so `enum` alone constrains both numeric and string values.
      expect(builder.getSchemas().Mixed).toEqual({
        enum: [1, "Other"],
      });
    });

    it("should build a string enum for a string literal union", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model ${t.model("M")} {
          status: "a" | "b";
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.status).toEqual({ type: "string", enum: ["a", "b"] });
    });

    it("should build anyOf for a general (non string-literal) union", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model ${t.model("M")} {
          field: string | int32;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.field).toEqual({
        anyOf: [{ type: "string" }, { type: "integer", format: "int32" }],
      });
    });

    it('should build `T | null` as `anyOf: [T, { type: "null" }]` (plan 2.6 decision)', async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model ${t.model("M")} {
          field: string | null;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.field).toEqual({
        anyOf: [{ type: "string" }, { type: "null" }],
      });
    });

    it("should register a named union in components.schemas and return a $ref", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Named } = await runner.compile(t.code`
        union ${t.union("Named")} { string, int32 }
      `);

      const builder = new SchemaBuilder(runner.program);
      const ref = builder.buildSchema(Named) as any;

      expect(ref.$ref).toBe("#/components/schemas/Named");
      expect(builder.getSchemas().Named).toEqual({
        anyOf: [{ type: "string" }, { type: "integer", format: "int32" }],
      });
    });

    it("should register a named string-literal union as a string enum, still behind a $ref", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Named } = await runner.compile(t.code`
        union ${t.union("Named")} { "a", "b" }
      `);

      const builder = new SchemaBuilder(runner.program);
      const ref = builder.buildSchema(Named) as any;

      expect(ref.$ref).toBe("#/components/schemas/Named");
      expect(builder.getSchemas().Named).toEqual({ type: "string", enum: ["a", "b"] });
    });

    it("should build an unsatisfiable schema for an empty enum instead of enum: [] or {}", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { E } = await runner.compile(t.code`
        enum ${t.enum("E")} { }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(E);

      expect(builder.getSchemas().E).toEqual({ not: {} });
    });

    it("should build an unsatisfiable schema for an empty named union instead of anyOf: [] or {}", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { U } = await runner.compile(t.code`
        union ${t.union("U")} { }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(U);

      expect(builder.getSchemas().U).toEqual({ not: {} });
    });

    it("should build a schema for a single enum member reference", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        enum Color { Red, Green }
        model ${t.model("M")} {
          c: Color.Red;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.c).toEqual({ type: "string", enum: ["Red"] });
    });

    it("should build a schema for a union of enum members", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        enum Color { Red, Green }
        model ${t.model("M")} {
          d: Color.Red | Color.Green;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.d).toEqual({
        anyOf: [
          { type: "string", enum: ["Red"] },
          { type: "string", enum: ["Green"] },
        ],
      });
    });

    it("should not register an uninstantiated union template declaration, and should key the real instantiation under the template's own name", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Wrap, M } = await runner.compile(t.code`
        union ${t.union("Wrap")}<T> { a: T, b: string }
        model ${t.model("M")} {
          x: Wrap<int32>;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      const declRef = builder.buildSchema(Wrap);
      expect(declRef).toEqual({});
      expect(Object.hasOwn(builder.getSchemas(), "Wrap")).toBe(false);

      builder.buildSchema(M);
      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.x).toEqual({ $ref: "#/components/schemas/Wrap" });
      expect(builder.getSchemas().Wrap).toEqual({
        anyOf: [{ type: "integer", format: "int32" }, { type: "string" }],
      });
    });

    it("should deduplicate repeated literal values in a string-literal union's enum", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { U } = await runner.compile(t.code`
        union ${t.union("U")} { a: "x", b: "x" }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(U);

      expect(builder.getSchemas().U).toEqual({ type: "string", enum: ["x"] });
    });

    it("should keep model, enum, and union in separate registry slots when they share a bare name", async () => {
      const runner = await AsyncAPITester.createInstance();
      // Both the model and the enum are named `Color` (one in `NS`, one in
      // the global namespace) — reaching them only through `M`'s properties
      // (rather than marking each with its own `t.model`/`t.enum`) avoids a
      // duplicate marker key while still exercising the real name collision.
      const { M } = await runner.compile(t.code`
        namespace NS {
          enum Color { Red }
        }
        model Color {
          x: string;
        }
        model ${t.model("M")} {
          a: Color;
          b: NS.Color;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.a).toEqual({ $ref: "#/components/schemas/Color" });
      expect(props.b).toEqual({ $ref: "#/components/schemas/NS.Color" });
      expect(builder.getSchemas().Color).toEqual({
        type: "object",
        properties: { x: { type: "string" } },
        required: ["x"],
      });
      expect(builder.getSchemas()["NS.Color"]).toEqual({ type: "string", enum: ["Red"] });
    });

    it("should build $ref for named enum and named union fields on a model", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        enum ${t.enum("Color")} { Red, Green }
        union ${t.union("Named")} { string, int32 }
        model ${t.model("M")} {
          c: Color;
          n: Named;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.c).toEqual({ $ref: "#/components/schemas/Color" });
      expect(props.n).toEqual({ $ref: "#/components/schemas/Named" });
      expect(builder.getSchemas().Color).toEqual({ type: "string", enum: ["Red", "Green"] });
      expect(builder.getSchemas().Named).toEqual({
        anyOf: [{ type: "string" }, { type: "integer", format: "int32" }],
      });
    });
  });

  describe("documentation (2.7)", () => {
    it("should map a model's doc comment to description and @summary to title", async () => {
      const { builder } = await buildDocSchema(t.code`
        /** A widget model. */
        @summary("Widget")
        model ${t.model("M")} {
          field: string;
        }
      `);

      expect(builder.getSchemas().M.title).toBe("Widget");
      expect(builder.getSchemas().M.description).toBe("A widget model.");
    });

    it("should map a model's @example values to an examples array", async () => {
      const { builder } = await buildDocSchema(t.code`
        @example(#{ field: "hello" })
        model ${t.model("M")} {
          field: string;
        }
      `);

      expect(builder.getSchemas().M.examples).toEqual([{ field: "hello" }]);
    });

    it("should emit only the bare example value, dropping @example's title/description options (draft-07 `examples` has nowhere to hang them; deferred to Phase 3's message-level examples)", async () => {
      const { builder } = await buildDocSchema(t.code`
        @example(#{ field: "hello" }, #{ title: "A title", description: "A description" })
        model ${t.model("M")} {
          field: string;
        }
      `);

      expect(builder.getSchemas().M.examples).toEqual([{ field: "hello" }]);
      expect(builder.getSchemas().M.title).toBeUndefined();
      expect(builder.getSchemas().M.description).toBeUndefined();
    });

    it("should omit title/description/examples keys entirely when not given", async () => {
      const { builder } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          field: string;
        }
      `);

      const schema = builder.getSchemas().M;
      // `toBeUndefined` alone would also pass if the key were present with an
      // `undefined` value (which would serialize to `title: null` etc. in
      // YAML/JSON) — assert the key is genuinely absent instead.
      expect(Object.hasOwn(schema, "title")).toBe(false);
      expect(Object.hasOwn(schema, "description")).toBe(false);
      expect(Object.hasOwn(schema, "examples")).toBe(false);
    });

    it("should omit a property's title/description/examples keys entirely when not given", async () => {
      const { builder } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          field: string;
        }
      `);

      const field = builder.getSchemas().M.properties?.field as Record<string, any>;
      expect(Object.hasOwn(field, "title")).toBe(false);
      expect(Object.hasOwn(field, "description")).toBe(false);
      expect(Object.hasOwn(field, "examples")).toBe(false);
    });

    it("should map an explicit @doc decorator to description", async () => {
      const { builder } = await buildDocSchema(t.code`
        @doc("A widget model, via decorator.")
        model ${t.model("M")} {
          field: string;
        }
      `);

      expect(builder.getSchemas().M.description).toBe("A widget model, via decorator.");
    });

    it("should map a property's doc comment to description and @summary to title", async () => {
      const { builder } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          /** The widget's name. */
          @summary("Name")
          field: string;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.field).toEqual({
        type: "string",
        title: "Name",
        description: "The widget's name.",
      });
    });

    it("should map a property's @example values to an examples array", async () => {
      const { builder } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          @example("hello")
          field: string;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.field).toEqual({ type: "string", examples: ["hello"] });
    });

    it("should wrap a $ref property in allOf to carry its own documentation", async () => {
      const { builder } = await buildDocSchema(t.code`
        model ${t.model("Widget")} {
          name: string;
        }
        model ${t.model("M")} {
          /** The referenced widget. */
          widget: Widget;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.widget).toEqual({
        allOf: [{ $ref: "#/components/schemas/Widget" }],
        description: "The referenced widget.",
      });
    });

    it("should preserve multiple @example values in source order (model and property)", async () => {
      const { builder } = await buildDocSchema(t.code`
        @example(#{ field: "a" })
        @example(#{ field: "b" })
        model ${t.model("M")} {
          @example("x")
          @example("y")
          field: string;
        }
      `);

      expect(builder.getSchemas().M.examples).toEqual([{ field: "a" }, { field: "b" }]);
      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.field.examples).toEqual(["x", "y"]);
    });

    it("should not throw and should skip an example whose value cannot be serialized", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        scalar myDate extends utcDateTime {
          init fromEpoch(v: int64);
        }
        model ${t.model("M")} {
          @example(myDate.fromEpoch(0))
          d: myDate;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      expect(() => builder.buildSchema(M)).not.toThrow();

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(Object.hasOwn(props.d as object, "examples")).toBe(false);
    });

    it("should omit (not null-fill) an example that serializes to undefined", async () => {
      const { builder } = await buildDocSchema(t.code`
        scalar ipv4 extends string {
          init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
        }
        model ${t.model("M")} {
          @example(ipv4.fromBytes(1, 2, 3, 4))
          ip: ipv4;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.ip).toEqual({ type: "string" });
    });

    it("should omit examples entirely when an array element cannot be serialized", async () => {
      const { builder } = await buildDocSchema(t.code`
        scalar ipv4 extends string {
          init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
        }
        model ${t.model("M")} {
          @example(#[ipv4.fromBytes(1, 2, 3, 4)])
          ips: ipv4[];
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.ips).toEqual({ type: "array", items: { type: "string" } });
    });

    it("should omit examples entirely when an object property cannot be serialized, and report a diagnostic instead of dropping it silently", async () => {
      const { builder, runner } = await buildDocSchema(t.code`
        scalar ipv4 extends string {
          init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
        }
        @example(#{ ip: ipv4.fromBytes(1, 2, 3, 4), name: "x" })
        model ${t.model("M")} {
          ip: ipv4;
          name: string;
        }
      `);

      expect(Object.hasOwn(builder.getSchemas().M, "examples")).toBe(false);
      // The whole example is dropped (even the sibling `name` field, which
      // was itself perfectly serializable) -- that must not happen in total
      // silence.
      expect(runner.program.diagnostics).toHaveLength(1);
      expect(runner.program.diagnostics[0].code).toBe("typespec-asyncapi/unserializable-example");
      expect(runner.program.diagnostics[0].severity).toBe("warning");
    });

    it("should apply a named scalar's own @summary/@doc at its use site", async () => {
      const { builder } = await buildDocSchema(t.code`
        /** An email address. */
        @summary("Email")
        scalar Email extends string;
        model ${t.model("M")} {
          e: Email;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.e).toEqual({
        type: "string",
        title: "Email",
        description: "An email address.",
      });
    });

    it("should not mix a property's own title with an inherited scalar description", async () => {
      const { builder } = await buildDocSchema(t.code`
        /** email doc */
        @summary("EmailTitle")
        scalar Email extends string;
        model ${t.model("M")} {
          @summary("PropTitle")
          e: Email;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.e).toEqual({ type: "string", title: "PropTitle" });
    });

    it("should not surface a built-in scalar's own standard-library doc comment", async () => {
      const { builder } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          field: string;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.field).toEqual({ type: "string" });
    });

    it("should not apply a property's own @encode when serializing its @example (2.7 does not map @encode into type/format)", async () => {
      const { builder } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          @encode("unixTimestamp", int32)
          @example(utcDateTime.fromISO("2020-01-01T00:00:00Z"))
          ts: utcDateTime;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      // The schema's type/format do not yet reflect @encode (that's plan 2.8),
      // so the example must not be encoded either -- otherwise the example
      // value would not validate against its own property's schema.
      expect(props.ts.type).toBe("string");
      expect(props.ts.format).toBe("date-time");
      expect(props.ts.examples).toEqual(["2020-01-01T00:00:00Z"]);
    });

    it("should keep an inherited scalar's title/description when a property only adds its own @example", async () => {
      const { builder } = await buildDocSchema(t.code`
        /** An email address. */
        @summary("Email")
        scalar Email extends string;
        model ${t.model("M")} {
          @example("a@b.com")
          e: Email;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.e).toEqual({
        type: "string",
        title: "Email",
        description: "An email address.",
        examples: ["a@b.com"],
      });
    });

    it("should map property names through @encodedName when serializing an @example (regression: schema/example key mismatch)", async () => {
      const { builder } = await buildDocSchema(t.code`
        @example(#{ userName: "bob" })
        model ${t.model("M")} {
          @encodedName("application/json", "user_name")
          userName: string;
        }
      `);

      const schema = builder.getSchemas().M as any;
      const properties = schema.properties as Record<string, unknown>;
      expect(schema.examples).toEqual([{ user_name: "bob" }]);
      expect(Object.keys(properties)).toEqual(["user_name"]);
      expect(schema.required).toEqual(["user_name"]);
    });

    it("should preserve source order for @@example augment decorators", async () => {
      const { builder } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          a: string;
        }
        @@example(M.a, "aug1");
        @@example(M.a, "aug2");
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.a.examples).toEqual(["aug1", "aug2"]);
    });

    it("should not apply @encode to a model-level @example's nested property (2.7 does not map @encode into type/format)", async () => {
      const { builder } = await buildDocSchema(t.code`
        @example(#{ ts: utcDateTime.fromISO("2020-01-01T00:00:00Z") })
        model ${t.model("M")} {
          @encode("unixTimestamp", int32)
          ts: utcDateTime;
        }
      `);

      const schema = builder.getSchemas().M as any;
      expect(schema.properties.ts).toEqual({ type: "string", format: "date-time" });
      expect(schema.examples).toEqual([{ ts: "2020-01-01T00:00:00Z" }]);
    });

    it("should not apply @encode to an @example on a property whose type is a model with an encoded nested property", async () => {
      const { builder } = await buildDocSchema(t.code`
        model Inner {
          @encode("unixTimestamp", int32)
          ts: utcDateTime;
        }
        model ${t.model("M")} {
          @example(#{ ts: utcDateTime.fromISO("2020-01-01T00:00:00Z") })
          p: Inner;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.p.examples).toEqual([{ ts: "2020-01-01T00:00:00Z" }]);
      const inner = builder.getSchemas().Inner as any;
      expect(inner.properties.ts).toEqual({ type: "string", format: "date-time" });
    });

    it("should not apply a scalar's own @encode when serializing its @example (2.7 does not map @encode into type/format)", async () => {
      const { builder } = await buildDocSchema(t.code`
        @encode("unixTimestamp", int32)
        scalar MyTs extends utcDateTime;
        model ${t.model("M")} {
          @example(MyTs.fromISO("2020-01-01T00:00:00Z"))
          a: MyTs;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.a.type).toBe("string");
      expect(props.a.format).toBe("date-time");
      expect(props.a.examples).toEqual(["2020-01-01T00:00:00Z"]);
    });

    it("should not let unrelated edits in a different file reorder cross-file @@example augment decorators", async () => {
      const mainCode = t.code`
        model ${t.model("M")} {
          f: string;
        }
        @@example(M, #{ f: "fromMainFile" });
      `;

      const testerA = AsyncAPITester.files({
        "aug.tsp": `@@example(M, #{ f: "fromAugFile" });`,
      }).import("./aug.tsp");
      const resultA = await testerA.compile(mainCode);
      const MA = resultA.M;
      const builderA = new SchemaBuilder(resultA.program);
      builderA.buildSchema(MA);
      const examplesA = (builderA.getSchemas().M as any).examples;

      const testerB = AsyncAPITester.files({
        "aug.tsp": `
          // pad line 1
          // pad line 2
          // pad line 3
          // pad line 4
          // pad line 5
          // pad line 6
          // pad line 7
          // pad line 8
          // pad line 9
          // pad line 10
          @@example(M, #{ f: "fromAugFile" });
        `,
      }).import("./aug.tsp");
      const resultB = await testerB.compile(mainCode);
      const MB = resultB.M;
      const builderB = new SchemaBuilder(resultB.program);
      builderB.buildSchema(MB);
      const examplesB = (builderB.getSchemas().M as any).examples;

      expect(examplesB).toEqual(examplesA);
    });

    it("should keep the JSON-encoded property key/required name even when an XML @encodedName is also declared (pinned; Phase 3 must thread the message's real contentType)", async () => {
      const { builder } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          @encodedName("application/json", "u_json")
          @encodedName("application/xml", "u_xml")
          userName: string;
        }
      `);

      const schema = builder.getSchemas().M as any;
      const properties = schema.properties as Record<string, unknown>;
      expect(Object.keys(properties)).toEqual(["u_json"]);
      expect(schema.required).toEqual(["u_json"]);
    });

    it("should apply docs to a named enum's registered schema", async () => {
      const { builder } = await buildDocSchema(t.code`
        /** Colors. */
        @summary("Color")
        enum ${t.enum("Color")} { Red, Green }
        model ${t.model("M")} {
          c: Color;
        }
      `);

      expect(builder.getSchemas().Color).toEqual({
        type: "string",
        enum: ["Red", "Green"],
        title: "Color",
        description: "Colors.",
      });
    });

    it("should apply docs to a named union's registered schema", async () => {
      const { builder } = await buildDocSchema(t.code`
        /** Either. */
        union ${t.union("Either")} { string, int32 }
        model ${t.model("M")} {
          e: Either;
        }
      `);

      expect(builder.getSchemas().Either).toEqual({
        anyOf: [{ type: "string" }, { type: "integer", format: "int32" }],
        description: "Either.",
      });
    });

    // Note: this only exercises the doc comment/@summary half of the union
    // variant fix, not @example. `@example` legally targets `UnionVariant`
    // per `decorators.tsp`, but the installed compiler's own checker
    // (`checkExampleValid` in `@typespec/compiler`'s decorators.js) validates
    // the example value against the `UnionVariant` type itself rather than
    // `variant.type` for this target kind, so *any* `@example` on a union
    // variant currently fails to compile with an "unassignable" error --
    // independent of and unrelated to this builder's own handling. The
    // `withPropertyDocs` plumbing added here already threads a variant's
    // `@example`s through once that upstream compiler bug is fixed.
    it("should apply a union variant's own doc comment/@summary to its anyOf branch", async () => {
      const { builder } = await buildDocSchema(t.code`
        union ${t.union("Either")} {
          /** The numeric branch. */
          @summary("Num")
          num: int32,
          str: string,
        }
        model ${t.model("M")} {
          e: Either;
        }
      `);

      expect(builder.getSchemas().Either).toEqual({
        anyOf: [
          {
            type: "integer",
            format: "int32",
            title: "Num",
            description: "The numeric branch.",
          },
          { type: "string" },
        ],
      });
    });

    it("should apply docs to a named array-alias model's registered schema", async () => {
      const { builder } = await buildDocSchema(t.code`
        /** A list of names. */
        model ${t.model("Names")} is string[];
        model ${t.model("M")} {
          n: Names;
        }
      `);

      expect(builder.getSchemas().Names).toEqual({
        type: "array",
        items: { type: "string" },
        description: "A list of names.",
      });
    });

    it("should not throw and should skip a malformed duration @example (compiler's Temporal.Duration.from throws a plain RangeError), reporting a diagnostic instead of dropping it silently", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model ${t.model("M")} {
          @example(duration.fromISO("not-a-duration"))
          d: duration;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      expect(() => builder.buildSchema(M)).not.toThrow();

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(Object.hasOwn(props.d as object, "examples")).toBe(false);
      expect(runner.program.diagnostics).toHaveLength(1);
      expect(runner.program.diagnostics[0].code).toBe("typespec-asyncapi/unserializable-example");
      expect(runner.program.diagnostics[0].severity).toBe("warning");
    });

    it("should keep the registry usable after a build() failure instead of leaving a dangling $ref (registerNamed try/finally)", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model ${t.model("M")} {
          f: string;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      const spy = vi
        .spyOn(
          builder as unknown as { buildObjectSchema: (m: unknown) => unknown },
          "buildObjectSchema",
        )
        .mockImplementationOnce(() => {
          throw new Error("boom");
        });

      expect(() => builder.buildSchema(M)).toThrow("boom");
      spy.mockRestore();

      // A retry must not return a $ref to a key that never got registered.
      const ref = builder.buildSchema(M) as { $ref: string };
      expect(ref.$ref).toBe("#/components/schemas/M");
      expect(Object.hasOwn(builder.getSchemas(), "M")).toBe(true);
    });

    it("should carry a base scalar's @doc/@summary through more than one level of derivation", async () => {
      const { builder } = await buildDocSchema(t.code`
        /** An email address. */
        @summary("Email")
        scalar Email extends string;
        scalar WorkEmail extends Email;
        model ${t.model("M")} {
          e: WorkEmail;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.e).toEqual({
        type: "string",
        title: "Email",
        description: "An email address.",
      });
    });
  });

  describe("validation keywords (2.8)", () => {
    it("should map @minLength/@maxLength on a property to minLength/maxLength", async () => {
      const { builder } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          @minLength(2)
          @maxLength(20)
          name: string;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.name).toEqual({ type: "string", minLength: 2, maxLength: 20 });
    });

    it("should map @pattern on a property to pattern", async () => {
      const { builder } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          @pattern("^[a-z]+$")
          name: string;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.name).toEqual({ type: "string", pattern: "^[a-z]+$" });
    });

    it("should map @format on a property to format", async () => {
      const { builder } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          @format("uuid")
          id: string;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.id).toEqual({ type: "string", format: "uuid" });
    });

    it("should map @minLength/@maxLength/@pattern/@format on a scalar declaration", async () => {
      const { builder } = await buildDocSchema(t.code`
        @minLength(2)
        @maxLength(20)
        @pattern("^[a-z]+$")
        @format("uuid")
        scalar Username extends string;
        model ${t.model("M")} {
          name: Username;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.name).toEqual({
        type: "string",
        minLength: 2,
        maxLength: 20,
        pattern: "^[a-z]+$",
        format: "uuid",
      });
    });

    it("should let a property's own @format override (not allOf-intersect with) a scalar's baked-in format", async () => {
      const { builder } = await buildDocSchema(t.code`
        @format("uuid")
        scalar Id extends string;
        model ${t.model("M")} {
          @format("uri")
          a: Id;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.a).toEqual({ type: "string", format: "uri" });
    });

    it("should let a derived scalar's own @format override a built-in's baked-in format", async () => {
      const { builder } = await buildDocSchema(t.code`
        @format("uri-reference")
        scalar Rel extends url;
        model ${t.model("M")} {
          a: Rel;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.a).toEqual({ type: "string", format: "uri-reference" });
    });

    it("should keep a scalar's inherited description at the property level when only an unrelated validation keyword collides", async () => {
      const { builder } = await buildDocSchema(t.code`
        @doc("A username")
        @minLength(5)
        scalar Username extends string;
        model ${t.model("M")} {
          @minLength(2)
          u: Username;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.u).toEqual({
        allOf: [{ type: "string", minLength: 5 }],
        description: "A username",
        minLength: 2,
      });
    });

    it("should keep an inherited scalar description at the top level when a derived scalar's own validation keyword collides", async () => {
      const { builder } = await buildDocSchema(t.code`
        @doc("Tight")
        @minLength(5)
        scalar Tight extends string;
        @minLength(2)
        scalar Loose extends Tight;
        model ${t.model("M")} {
          v: Loose;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.v).toEqual({
        allOf: [{ type: "string", minLength: 5 }],
        description: "Tight",
        minLength: 2,
      });
    });

    it("should map @minValue/@maxValue on a property to minimum/maximum", async () => {
      const { builder } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          @minValue(18)
          @maxValue(200)
          age: int32;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.age).toEqual({ type: "integer", format: "int32", minimum: 18, maximum: 200 });
    });

    it("should map @minValueExclusive/@maxValueExclusive on a property to exclusiveMinimum/exclusiveMaximum", async () => {
      const { builder } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          @minValueExclusive(0)
          @maxValueExclusive(50)
          distance: float64;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.distance).toEqual({
        type: "number",
        format: "double",
        exclusiveMinimum: 0,
        exclusiveMaximum: 50,
      });
    });

    it("should map @minValue/@maxValue on a numeric scalar declaration to minimum/maximum", async () => {
      const { builder } = await buildDocSchema(t.code`
        @minValue(18)
        @maxValue(200)
        scalar Age extends int32;
        model ${t.model("M")} {
          age: Age;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.age).toEqual({ type: "integer", format: "int32", minimum: 18, maximum: 200 });
    });

    it("should map @minItems/@maxItems on a property to minItems/maxItems", async () => {
      const { builder } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          @minItems(1)
          @maxItems(5)
          tags: string[];
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.tags).toEqual({
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 5,
      });
    });

    it("should map @minItems/@maxItems on a named array alias model to minItems/maxItems", async () => {
      const { builder } = await buildDocSchema(t.code`
        @minItems(1)
        @maxItems(5)
        model Endpoints is string[];
        model ${t.model("M")} {
          endpoints: Endpoints;
        }
      `);

      expect(builder.getSchemas().Endpoints).toEqual({
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 5,
      });
    });

    it("should wrap a $ref'd property's own minItems in allOf rather than dropping it", async () => {
      const { builder } = await buildDocSchema(t.code`
        model Endpoints is string[];
        model ${t.model("M")} {
          @minItems(1)
          endpoints: Endpoints;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.endpoints).toEqual({
        allOf: [{ $ref: "#/components/schemas/Endpoints" }],
        minItems: 1,
      });
    });

    it("should carry a base scalar's @minLength through more than one level of derivation", async () => {
      const { builder } = await buildDocSchema(t.code`
        @minLength(2)
        scalar Email extends string;
        scalar WorkEmail extends Email;
        model ${t.model("M")} {
          a: WorkEmail;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.a).toEqual({ type: "string", minLength: 2 });
    });

    it("should intersect (not silently drop) a base scalar's own @minLength/@pattern when a derived scalar declares a weaker one", async () => {
      const { builder } = await buildDocSchema(t.code`
        @minLength(5)
        @pattern("^[a-z]+$")
        scalar Tight extends string;
        @minLength(2)
        scalar Loose extends Tight;
        model ${t.model("M")} {
          v: Loose;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      // Tight's stricter minLength(5)/pattern must still be enforced
      // alongside Loose's own (weaker) minLength(2) — losing them would let
      // "ab" validate even though Tight forbids it.
      expect(props.v).toEqual({
        allOf: [{ type: "string", minLength: 5, pattern: "^[a-z]+$" }],
        minLength: 2,
      });
    });

    it("should intersect a numeric base scalar's @minValue with a derived scalar's weaker @minValue", async () => {
      const { builder } = await buildDocSchema(t.code`
        @minValue(10)
        scalar Age extends int32;
        @minValue(1)
        scalar YoungAge extends Age;
        model ${t.model("M")} {
          v: YoungAge;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.v).toEqual({
        allOf: [{ type: "integer", format: "int32", minimum: 10 }],
        minimum: 1,
      });
    });

    it("should let a property's own @minLength override its scalar's @minLength", async () => {
      const { builder } = await buildDocSchema(t.code`
        @minLength(2)
        scalar Username extends string;
        model ${t.model("M")} {
          @minLength(5)
          name: Username;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.name).toEqual({
        allOf: [{ type: "string", minLength: 2 }],
        minLength: 5,
      });
    });

    it("should intersect (not silently drop) a scalar's own @minLength/@pattern when the property declares a weaker one", async () => {
      const { builder } = await buildDocSchema(t.code`
        @minLength(5)
        @pattern("^[a-z]+$")
        scalar Username extends string;
        model ${t.model("M")} {
          @minLength(2)
          @pattern("^.*$")
          name: Username;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      // The scalar's own (stricter) constraints must still be enforced
      // alongside the property's own (weaker) ones — losing them would let
      // `"AB"` validate even though `Username` forbids it.
      expect(props.name).toEqual({
        allOf: [{ type: "string", minLength: 5, pattern: "^[a-z]+$" }],
        minLength: 2,
        pattern: "^.*$",
      });
    });

    it("should let a property's own @doc replace (not merge with) the scalar's @doc even when a validation keyword collides", async () => {
      const { builder } = await buildDocSchema(t.code`
        @doc("scalar doc")
        @minLength(5)
        scalar Username extends string;
        model ${t.model("M")} {
          @doc("prop doc")
          @minLength(2)
          u: Username;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.u).toEqual({
        allOf: [{ type: "string", minLength: 5 }],
        description: "prop doc",
        minLength: 2,
      });
    });

    it("should report a diagnostic instead of silently dropping an unrepresentable @maxValue on int64", async () => {
      const { builder, runner } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          @minValue(-9223372036854775808)
          @maxValue(9223372036854775807)
          v: int64;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      // The exact bound cannot be represented as a JS number, so it is not
      // emitted as `minimum`/`maximum` — but the drop must be diagnosed.
      expect(props.v.minimum).toBeUndefined();
      expect(props.v.maximum).toBeUndefined();
      expect(
        runner.program.diagnostics.some(
          (d) => d.code === "typespec-asyncapi/unrepresentable-numeric-constraint",
        ),
      ).toBe(true);
    });

    it("should report a diagnostic instead of silently dropping a temporal @minValue", async () => {
      const { builder, runner } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          @minValue(utcDateTime.fromISO("2020-01-01T00:00:00Z"))
          at: utcDateTime;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.at).toEqual({ type: "string", format: "date-time" });
      expect(
        runner.program.diagnostics.some(
          (d) => d.code === "typespec-asyncapi/unsupported-temporal-range-constraint",
        ),
      ).toBe(true);
    });

    it("should apply an augment @@minLength on a built-in scalar", async () => {
      const { builder } = await buildDocSchema(t.code`
        @@minLength(TypeSpec.string, 3);
        model ${t.model("M")} {
          v: string;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.v).toEqual({ type: "string", minLength: 3 });
    });

    it("should report a diagnostic instead of silently dropping an unrepresentable @maxLength", async () => {
      const { builder, runner } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          @maxLength(99999999999999999999)
          name: string;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.name.maxLength).toBeUndefined();
      expect(
        runner.program.diagnostics.some(
          (d) => d.code === "typespec-asyncapi/unrepresentable-numeric-constraint",
        ),
      ).toBe(true);
    });

    it("should report a diagnostic instead of silently dropping an unrepresentable @minItems", async () => {
      const { builder, runner } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          @minItems(99999999999999999999)
          tags: string[];
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.tags.minItems).toBeUndefined();
      expect(
        runner.program.diagnostics.some(
          (d) => d.code === "typespec-asyncapi/unrepresentable-numeric-constraint",
        ),
      ).toBe(true);
    });

    it("should report a scalar's constraint diagnostic only once even when used by multiple properties", async () => {
      const { runner } = await buildDocSchema(t.code`
        @maxValue(9223372036854775807)
        scalar Big extends int64;
        model ${t.model("M")} {
          a: Big;
          b: Big;
          c: Big;
        }
      `);

      const occurrences = runner.program.diagnostics.filter(
        (d) => d.code === "typespec-asyncapi/unrepresentable-numeric-constraint",
      );
      expect(occurrences).toHaveLength(1);
    });

    it("should name the actual decorator (not the @minValue family) in an unrepresentable @maxLength/@maxItems diagnostic", async () => {
      const { runner: lengthRunner } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          @maxLength(99999999999999999999)
          name: string;
        }
      `);
      const lengthMessage = lengthRunner.program.diagnostics.find(
        (d) => d.code === "typespec-asyncapi/unrepresentable-numeric-constraint",
      )?.message;
      expect(lengthMessage).toContain("maxLength");

      const { runner: itemsRunner } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          @maxItems(99999999999999999999)
          tags: string[];
        }
      `);
      const itemsMessage = itemsRunner.program.diagnostics.find(
        (d) => d.code === "typespec-asyncapi/unrepresentable-numeric-constraint",
      )?.message;
      expect(itemsMessage).toContain("maxItems");
    });

    it("should report a separate diagnostic for each of two independently-overflowing constraints on the same property", async () => {
      const { runner } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          @minLength(99999999999999999999)
          @maxLength(99999999999999999999)
          name: string;
        }
      `);

      const occurrences = runner.program.diagnostics.filter(
        (d) => d.code === "typespec-asyncapi/unrepresentable-numeric-constraint",
      );
      expect(occurrences).toHaveLength(2);
    });
  });
});
