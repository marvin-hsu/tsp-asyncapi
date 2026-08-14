/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect } from "vitest";
import { AsyncAPITester } from "../../src/testing/index.js";
import { t } from "@typespec/compiler/testing";
import { SchemaBuilder } from "../../src/builders/schemas.js";
import { Model } from "@typespec/compiler";

describe("Unit: Schemas (Phase 2)", () => {
  describe("buildSchema", () => {
    it("should build string scalar schema", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { TestModel } = await runner.compile(t.code`
        model ${t.model("TestModel")} {
          field: string;
        }
      `);

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
      builder.buildSchema(GlobalFoo as Model);
      const ref2 = builder.buildSchema(NsFoo as Model) as any;

      // Qualified name is `a/b.Foo`; the `/` inside it must be escaped too.
      expect(ref2.$ref).toBe("#/components/schemas/a~1b.Foo");
      const components = builder.getSchemas();
      expect(Object.hasOwn(components, "a/b.Foo")).toBe(true);
    });

    it("pins that `extends` currently drops inherited properties and never registers the base model (plan 2.9 will add allOf)", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Derived } = await runner.compile(t.code`
        model Base { a: string; }
        model ${t.model("Derived")} extends Base { b: int32; }
      `);

      const builder = new SchemaBuilder();
      builder.buildSchema(Derived);

      const components = builder.getSchemas();
      // Known, tracked gap (plan/review 2026-08-14-30, plan 2.9): only the
      // model's own declared properties are built; inherited properties and
      // the base model itself are silently absent until `allOf` support
      // lands. This test pins the current behaviour so a fix is deliberate.
      expect(Object.keys(components)).toEqual(["Derived"]);
      expect(components.Derived).toEqual({
        type: "object",
        properties: { b: { type: "integer", format: "int32" } },
        required: ["b"],
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

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
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

      const builder = new SchemaBuilder();
      builder.buildSchema(W);

      const props = builder.getSchemas().W.properties as Record<string, any>;
      // `x` (NS2.Foo) is visited first, so it claims the bare name.
      expect(props.x).toEqual({ $ref: "#/components/schemas/Foo" });
      expect(props.y).toEqual({ $ref: "#/components/schemas/NS1.Foo" });
    });
  });
});
