/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, vi } from "vitest";
import { AsyncAPITester } from "../../src/testing/index.js";
import { t, TemplateWithMarkers } from "@typespec/compiler/testing";
import { SchemaBuilder } from "../../src/builders/schemas/builder.js";
import { Entity, Model } from "@typespec/compiler";
import { Ajv } from "ajv";

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
      // user-declared scalars in `MyLib`, not the TypeSpec built-ins. They
      // must resolve via their own baseScalar chain, not the lookup table.
      expect(props.d).toEqual({ type: "integer", format: "int32" });
      expect(props.u).toEqual({ type: "integer", format: "int64" });
    });

    it("falls back to the unconstrained schema for a scalar derived from a built-in that has no dedicated table entry", async () => {
      const runner = await AsyncAPITester.createInstance();
      // `unixTimestamp32` is a real TypeSpec standard-library scalar (it
      // extends `utcDateTime`), but `SCALAR_SCHEMAS` carries no entry for
      // it. A built-in scalar is always looked up by its own name; it never
      // falls through to its `baseScalar`'s mapping. So a user scalar
      // derived from it bottoms out at the unconstrained `{}` shape, the
      // same as a user scalar derived from no built-in at all.
      const { M } = await runner.compile(t.code`
        scalar Foo extends unixTimestamp32;
        model ${t.model("M")} {
          a: Foo;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.a).toEqual({});
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

    it("should Sep-encode `/` and `~` out of a backtick-declared model's own name, rather than leaking them into the schema key", async () => {
      // A model's own name is now sanitized before it becomes a
      // `components.schemas` key (see `sanitizeDeclarationName`). So `/`
      // and `~`, both outside the AsyncAPI Components Object key charset,
      // never reach the key at all. There is nothing left here for
      // `toJsonPointerToken`'s RFC 6901 escaping to do; it stays in place
      // as a defense-in-depth guard for a key from any other future
      // source.
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
      expect(Object.hasOwn(components, "x/y")).toBe(false);
      expect(Object.hasOwn(components, "a~b")).toBe(false);

      const props = components.M.properties as Record<string, any>;
      for (const ref of [props.q.$ref, props.r.$ref] as string[]) {
        const key = ref.replace("#/components/schemas/", "");
        expect(key).toMatch(/^[a-zA-Z0-9.\-_]+$/);
        expect(Object.hasOwn(components, key)).toBe(true);
      }
      // '/' (47) and '~' (126) are each Sep-encoded distinctly.
      expect(props.q.$ref).toBe("#/components/schemas/XSep47Y");
      expect(props.r.$ref).toBe("#/components/schemas/ASep126B");
    });

    it("Sep-encodes a `/`-containing namespace's name into the key, instead of colliding with a same-named global model", async () => {
      // A plain (non-template) declaration's key is namespace-qualified by
      // default (see `declarationNameFor`). `NsFoo` and `GlobalFoo` no
      // longer compute the same bare "Foo" candidate, so they no longer
      // collide. Each namespace segment goes through the same sanitizer a
      // declaration's own name does, so a backtick-quoted namespace such as
      // `` `a/b` `` cannot leak a charset-illegal character into the key.
      // The emitted $ref then needs no JSON-Pointer escaping either.
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
      const ref1 = builder.buildSchema(GlobalFoo as Model) as any;
      const ref2 = builder.buildSchema(NsFoo as Model) as any;

      expect(ref1.$ref).toBe("#/components/schemas/Foo");
      expect(ref2.$ref).toBe("#/components/schemas/ASep47B.Foo");
      expect(Object.hasOwn(builder.getSchemas(), "ASep47B.Foo")).toBe(true);
      expect(Object.hasOwn(builder.getSchemas(), "a/b.Foo")).toBe(false);

      const diagnostic = runner.program.diagnostics.find(
        (d) => d.code === "typespec-asyncapi/duplicate-schema-key",
      );
      expect(diagnostic).toBeUndefined();
    });

    it("Sep-encodes a `#`-containing or space-containing namespace's name, keeping the key in the AsyncAPI charset and the $ref resolvable", async () => {
      // A raw `#` in a key would put a second `#` in the $ref URI, which is
      // not a resolvable fragment, and a raw space is not a legal key
      // character either. Neither survives sanitization.
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        namespace \`a#b\` { model F { x: string; } }
        namespace \`has space\` { model G { y: string; } }
        @test("M")
        model M {
          f: \`a#b\`.F;
          g: \`has space\`.G;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);

      const components = builder.getSchemas() as Record<string, any>;
      const props = components.M.properties as Record<string, any>;
      for (const ref of [props.f.$ref, props.g.$ref] as string[]) {
        expect(ref.split("#")).toHaveLength(2);
        expect(ref).not.toContain(" ");
        const key = ref.replace("#/components/schemas/", "");
        expect(key).toMatch(/^[a-zA-Z0-9.\-_]+$/);
        expect(Object.hasOwn(components, key)).toBe(true);
      }
      // '#' (35) and ' ' (32) are each Sep-encoded distinctly.
      expect(props.f.$ref).toBe("#/components/schemas/ASep35B.F");
      expect(props.g.$ref).toBe("#/components/schemas/HasSep32Space.G");
    });

    it("should build `model B extends A` as `allOf: [{ $ref: A }, own]`, registering both models", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Derived } = await runner.compile(t.code`
        model Base { a: string; }
        model ${t.model("Derived")} extends Base { b: int32; }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Derived);

      const components = builder.getSchemas();
      // `Derived`'s own declared properties (`b`) are layered as a sibling
      // to a `$ref` back to `Base`. `Base` is registered too, rather than
      // its properties being inlined/duplicated into `Derived`.
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
      // `M` at the type level. `model.properties` includes them directly,
      // and no `baseModel` link is created. So this is the same plain-object
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

    it("should hoist discriminator to the schema root even when the @discriminator-annotated model itself has a baseModel", async () => {
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
      // `discriminator` must sit at the schema root, alongside `allOf`. It
      // must not be buried inside `allOf`'s second (own-shape) branch,
      // where no AsyncAPI 3.x consumer would ever look for it.
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

    it("should flatten (not allOf) a derived model whose override property has a different @encodedName than the inherited one", async () => {
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
      // wire name `k`. No stale `allOf` branch should remain requiring the
      // base's `kind` key, which `Cat`'s wire payload never carries.
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

    it("should flatten (not allOf) a derived model whose new property's wire name collides with a different inherited property's wire name", async () => {
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
      // property. Losing it would let a payload with a non-string extra
      // property validate, even though Base's indexer forbids it.
      expect(components.Derived).toEqual({
        type: "object",
        additionalProperties: { type: "string" },
        properties: { y: { type: "string" } },
        required: ["y"],
      });
    });

    it("should drop a `never`-typed override of an inherited property under `extends`, matching the flatten fallback's behavior", async () => {
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

    it("should report missing-discriminator-property when @discriminator is applied to a collection-backed model", async () => {
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

    it("should emit a plain anyOf for a @discriminated union, not yet reflecting its envelope semantics", async () => {
      // This is a known, documented gap. The newer `@discriminated` union
      // decorator defaults to `envelope: "object"`, but this emitter does
      // not yet support that envelope shape. This test pins the current,
      // incomplete `anyOf` output. That way the gap cannot silently regress
      // into looking "supported" without anyone noticing. The real wire
      // shape for `envelope: "object"` is `{ "kind": "a", "value": { ... } }`.
      // That shape does NOT validate against this schema. Full envelope
      // support is deferred to a future phase.
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

    it("gives same-named models in different namespaces distinct, namespace-qualified keys instead of colliding", async () => {
      // `declarationNameFor` now prefixes a plain (non-template)
      // declaration's own name with its namespace chain by default (see
      // `namespacePrefix`), matching the official
      // `getTypeName`/`getNamespacePrefix` behavior. `NS1.Duplicate1` and
      // `NS2.Duplicate1` compute different candidates, so they no longer
      // collide and no diagnostic is reported.
      const runner = await AsyncAPITester.createInstance();
      const { Type1, Type2 } = await runner.compile(t.code`
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

      expect(ref1.$ref).toBe("#/components/schemas/NS1.Duplicate1");
      expect(ref2.$ref).toBe("#/components/schemas/NS2.Duplicate1");

      const diagnostic = runner.program.diagnostics.find(
        (d) => d.code === "typespec-asyncapi/duplicate-schema-key",
      );
      expect(diagnostic).toBeUndefined();
    });

    it("gives a global-namespace model and a namespaced same-named model distinct keys (namespaced built first)", async () => {
      // The global namespace's own prefix is the empty string (see
      // `namespacePrefix`), so `GlobalFoo` keeps the bare "Foo" key while
      // `NsFoo` gets the namespace-qualified "NS2.Foo" key. The two no
      // longer compute the same candidate, regardless of build order.
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
      const ref1 = builder.buildSchema(NsFoo as Model) as any;
      const ref2 = builder.buildSchema(GlobalFoo as Model) as any;

      expect(ref1.$ref).toBe("#/components/schemas/NS2.Foo");
      expect(ref2.$ref).toBe("#/components/schemas/Foo");

      const diagnostic = runner.program.diagnostics.find(
        (d) => d.code === "typespec-asyncapi/duplicate-schema-key",
      );
      expect(diagnostic).toBeUndefined();
    });

    it("gives a global-namespace model and a namespaced same-named model distinct keys (global built first)", async () => {
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

      const diagnostic = runner.program.diagnostics.find(
        (d) => d.code === "typespec-asyncapi/duplicate-schema-key",
      );
      expect(diagnostic).toBeUndefined();
    });

    it("leaves the service namespace out of a schema key, while still qualifying a namespace nested under it", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Order, SubOrder } = await runner.compile(t.code`
        @service(#{ title: "Order Events" })
        namespace MyService;
        @test("Order")
        model Order {
          id: string;
        }
        namespace Sub {
          @test("SubOrder")
          model Order {
            id: int32;
          }
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      const ref1 = builder.buildSchema(Order as Model) as any;
      const ref2 = builder.buildSchema(SubOrder as Model) as any;

      // Nearly every declaration in a single-service spec lives under the
      // service namespace, so it carries no distinguishing information. The
      // official emitters drop it through their own `namespaceFilter`. A
      // namespace nested under it still qualifies the key.
      expect(ref1.$ref).toBe("#/components/schemas/Order");
      expect(ref2.$ref).toBe("#/components/schemas/Sub.Order");
    });

    it("gives two same-named templates in sibling namespaces distinct keys for the same type argument", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model Order { id: string; }
        namespace A {
          model Env<T> { a: T; }
        }
        namespace B {
          model Env<T> { b: T; }
        }
        @test("M")
        model M {
          x: A.Env<Order>;
          y: B.Env<Order>;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const props = builder.getSchemas().M.properties as Record<string, any>;

      // A template instantiation is qualified by its own declaring
      // namespace, exactly like a plain declaration. Only the arguments'
      // namespaces would not tell these two apart.
      expect(props.x).toEqual({ $ref: "#/components/schemas/A.EnvOrder" });
      expect(props.y).toEqual({ $ref: "#/components/schemas/B.EnvOrder" });

      const diagnostic = runner.program.diagnostics.find(
        (d) => d.code === "typespec-asyncapi/duplicate-schema-key",
      );
      expect(diagnostic).toBeUndefined();
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
      // `W` is itself a plain (non-template) declaration inside `NS`, so its
      // own key is namespace-qualified: "NS.W", not the bare "W".
      const props = components["NS.W"].properties as Record<string, any>;
      const refs = [props.a.$ref, props.b.$ref, props.c.$ref] as string[];
      // Every instantiation of Page<T> is named from the template's own
      // name plus its type argument's display name, and is qualified by its
      // own declaring namespace exactly like a plain declaration. So each
      // instantiation gets its own distinguishable key up front. Two
      // instantiations of one template never compete for a key, and a
      // genuine collision with an unrelated declaration is a hard
      // `duplicate-schema-key` error rather than a silent rename.
      expect(refs).toEqual([
        "#/components/schemas/NS.PageString",
        "#/components/schemas/NS.PageInt32",
        "#/components/schemas/NS.PageBoolean",
      ]);

      const itemTypes = refs.map((ref) => {
        const key = ref.replace("#/components/schemas/", "");
        const schema = components[key] as any;
        return schema.properties.items.items.type as string;
      });
      expect(itemTypes).toEqual(["string", "integer", "boolean"]);
    });

    it("gives two same-named models under different multi-level namespace chains distinct, namespace-qualified keys", async () => {
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

      // The global namespace contributes no prefix; the nested chain is
      // joined with '.' and separated from the declaration's own name by a
      // further '.' (see `namespacePrefix`), so the two no longer compute
      // the same candidate.
      expect(ref1.$ref).toBe("#/components/schemas/Widget");
      expect(ref2.$ref).toBe("#/components/schemas/Foo.Bar.Widget");

      const diagnostic = runner.program.diagnostics.find(
        (d) => d.code === "typespec-asyncapi/duplicate-schema-key",
      );
      expect(diagnostic).toBeUndefined();
    });

    it("keeps a stable $ref, with no diagnostic, when a namespace-qualified model is referenced again from a sibling namespace", async () => {
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
      // `NS1.Duplicate1` and `NS2.Duplicate1` are namespace-qualified by
      // default, so they no longer collide into one shared key.
      expect(Object.hasOwn(components, "NS1.Duplicate1")).toBe(true);
      expect(Object.hasOwn(components, "NS2.Duplicate1")).toBe(true);
      // `Wrapper` (in `NS2`) is itself namespace-qualified too. Its `inner`
      // property references `NS2.Duplicate1`, its own namespace's type, by
      // its own stable key.
      expect(components["NS2.Wrapper"].properties?.inner).toEqual({
        $ref: "#/components/schemas/NS2.Duplicate1",
      });

      const diagnostics = runner.program.diagnostics.filter(
        (d) => d.code === "typespec-asyncapi/duplicate-schema-key",
      );
      expect(diagnostics).toHaveLength(0);
    });

    it("resolves same-named models from different namespaces to distinct keys regardless of referencing-property order", async () => {
      // Under the old first-come-first-served/hard-error policies, the
      // *order* two colliding properties were visited in used to matter.
      // Under default namespace-qualified naming there is no collision at
      // all to race over: each property's namespace-qualified key is fixed
      // by its own declaring namespace, independent of visitation order.
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
      expect(props.x).toEqual({ $ref: "#/components/schemas/NS2.Foo" });
      expect(props.y).toEqual({ $ref: "#/components/schemas/NS1.Foo" });

      const diagnostics = runner.program.diagnostics.filter(
        (d) => d.code === "typespec-asyncapi/duplicate-schema-key",
      );
      expect(diagnostics).toHaveLength(0);
    });

    it("resolves a namespace-qualified name the same way when one namespace is declared blockless", async () => {
      const runner = await AsyncAPITester.createInstance();
      // `namespace Foo;` (no braces) must be the file's first statement. It
      // puts every following top-level declaration into `Foo`, the same way
      // `namespace Foo { ... }` would. `Bar` is then a nested block
      // namespace inside `Foo`. Symbol resolution, and so the namespace
      // chain `namespacePrefix` walks, must not depend on which namespace
      // syntax produced it.
      const { FooWidget, BarWidget } = await runner.compile(t.code`
        namespace Foo;
        @test("FooWidget")
        model Widget {
          a: string;
        }
        namespace Bar {
          @test("BarWidget")
          model Widget {
            b: int32;
          }
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      const ref1 = builder.buildSchema(FooWidget as Model) as any;
      const ref2 = builder.buildSchema(BarWidget as Model) as any;

      expect(ref1.$ref).toBe("#/components/schemas/Foo.Widget");
      expect(ref2.$ref).toBe("#/components/schemas/Foo.Bar.Widget");

      const diagnostic = runner.program.diagnostics.find(
        (d) => d.code === "typespec-asyncapi/duplicate-schema-key",
      );
      expect(diagnostic).toBeUndefined();
    });
  });

  describe("enum and union", () => {
    it("should build a string enum from members with no explicit value, using each member's own name as its value", async () => {
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

    it("should fall back to a string enum when a mix of numeric members and members with no explicit value appear", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Mixed } = await runner.compile(t.code`
        enum ${t.enum("Mixed")} { Active: 1, Other }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(Mixed);

      // `type: "string"` would make the numeric member `1` unsatisfiable.
      // Omit `type` so `enum` alone constrains both numeric and string
      // values.
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

    it("should build oneOf instead of anyOf for a union marked with @oneOf", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        @AsyncAPI.oneOf
        union Shape { string, int32 }
        model ${t.model("M")} {
          field: Shape;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.field).toEqual({ $ref: "#/components/schemas/Shape" });
      expect(builder.getSchemas().Shape).toEqual({
        oneOf: [{ type: "string" }, { type: "integer", format: "int32" }],
      });
    });

    it("should still build anyOf for a union with no @oneOf", async () => {
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

    it("should build oneOf for a named union marked with @oneOf, still behind a $ref", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { Named } = await runner.compile(t.code`
        @AsyncAPI.oneOf
        union ${t.union("Named")} { string, int32 }
      `);

      const builder = new SchemaBuilder(runner.program);
      const ref = builder.buildSchema(Named) as any;

      expect(ref.$ref).toBe("#/components/schemas/Named");
      expect(builder.getSchemas().Named).toEqual({
        oneOf: [{ type: "string" }, { type: "integer", format: "int32" }],
      });
    });

    it('should build `T | null` as `anyOf: [T, { type: "null" }]`', async () => {
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

    it("should not register an uninstantiated union template declaration, and should key the real instantiation from the template name plus its type argument", async () => {
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
      expect(props.x).toEqual({ $ref: "#/components/schemas/WrapInt32" });
      expect(builder.getSchemas().WrapInt32).toEqual({
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

    it("reports a diagnostic error when a model and an enum of a different kind share a bare name in the same namespace (registry is not scoped per-kind)", async () => {
      const runner = await AsyncAPITester.createInstance();
      // Default namespace-qualified naming (see `declarationNameFor`) means
      // two same-named declarations only collide when they resolve to the
      // *same* candidate. Two distinctly-named declarations, one a model
      // and one an enum, are forced to the same candidate here via
      // `@friendlyName`. An explicit friendly name is taken verbatim, with
      // no namespace qualification, so both resolve to the bare "Color".
      // `SchemaKeyRegistry` shares one key namespace across every declared
      // kind (model/enum/union), so this is a genuine collision, not two
      // "separate registry slots" for the two kinds.
      const { M } = await runner.compile(t.code`
        namespace NS {
          @friendlyName("Color")
          enum ColorEnum { Red }
          @friendlyName("Color")
          model ColorModel {
            x: string;
          }
        }
        model ${t.model("M")} {
          a: NS.ColorModel;
          b: NS.ColorEnum;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.a).toEqual({ $ref: "#/components/schemas/Color" });
      expect(props.b).toEqual({ $ref: "#/components/schemas/Color" });

      const diagnostic = runner.program.diagnostics.find(
        (d) => d.code === "typespec-asyncapi/duplicate-schema-key",
      );
      expect(diagnostic).toBeDefined();
      expect(diagnostic?.severity).toBe("error");
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

  describe("@jsonSchemaExtension", () => {
    it("merges two separate applications' key/value pairs alongside a model's own properties", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        @AsyncAPI.jsonSchemaExtension("unevaluatedProperties", false)
        @AsyncAPI.jsonSchemaExtension("propertyNames", #{ pattern: "^[a-z]+$" })
        model ${t.model("M")} {
          id: string;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M);

      expect(builder.getSchemas().M).toEqual({
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        unevaluatedProperties: false,
        propertyNames: { pattern: "^[a-z]+$" },
      });
    });

    it("merges its key/value pair into a property's own schema entry", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model ${t.model("M")} {
          @AsyncAPI.jsonSchemaExtension("deprecated", true)
          name: string;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.name).toEqual({ type: "string", deprecated: true });
    });

    it("leaves a model or property with no application completely unaffected", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model ${t.model("M")} {
          name: string;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M);

      expect(builder.getSchemas().M).toEqual({
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      });
    });

    it("lets an extension key override a keyword this emitter already produces for that model", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        @AsyncAPI.jsonSchemaExtension("type", "override")
        model ${t.model("M")} {
          name: string;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M);

      const schema = builder.getSchemas().M as Record<string, any>;
      expect(schema.type).toBe("override");
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
      // `toBeUndefined` alone would also pass if the key were present with
      // an `undefined` value. That would serialize to `title: null` etc. in
      // YAML/JSON. Assert the key is genuinely absent instead.
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

    it("should not apply a property's own @encode when serializing its @example", async () => {
      const { builder } = await buildDocSchema(t.code`
        model ${t.model("M")} {
          @encode("unixTimestamp", int32)
          @example(utcDateTime.fromISO("2020-01-01T00:00:00Z"))
          ts: utcDateTime;
        }
      `);

      const props = builder.getSchemas().M.properties as Record<string, any>;
      // The schema's type/format do not yet reflect @encode. So the example
      // must not be encoded either. Otherwise, the example value would not
      // validate against its own property's schema.
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

    it("keeps a generic model's own @doc/@summary on every instantiation", async () => {
      const runner = await AsyncAPITester.createInstance();
      // `Envelope`'s own doc/summary are declared once, on the
      // uninstantiated template. TypeSpec's instantiation semantics copy
      // the type definition, so each instantiation must carry them too,
      // not just the first one built.
      const { W } = await runner.compile(t.code`
        /** A generic envelope. */
        @summary("Envelope")
        model Envelope<T> {
          data: T;
        }
        model Order { id: string; }
        model Product { sku: string; }
        @test("W")
        model W {
          order: Envelope<Order>;
          product: Envelope<Product>;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(W as Model);
      const components = builder.getSchemas();

      expect(components.EnvelopeOrder).toMatchObject({
        title: "Envelope",
        description: "A generic envelope.",
      });
      expect(components.EnvelopeProduct).toMatchObject({
        title: "Envelope",
        description: "A generic envelope.",
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
      // alongside Loose's own (weaker) minLength(2). Losing them would let
      // "ab" validate, even though Tight forbids it.
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
      // alongside the property's own (weaker) ones. Losing them would let
      // `"AB"` validate, even though `Username` forbids it.
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
      // emitted as `minimum`/`maximum`. But the drop must be diagnosed.
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

    it("keeps a generic model property's validation decorator on every instantiation", async () => {
      const runner = await AsyncAPITester.createInstance();
      // `@minLength` is declared once, on `Wrapper<T>`'s own `label`
      // property. TypeSpec's instantiation semantics copy the type
      // definition, so each instantiation's built schema must keep it too.
      const { W } = await runner.compile(t.code`
        model Wrapper<T> {
          @minLength(3)
          label: string;
          data: T;
        }
        model Order { id: string; }
        model Product { sku: string; }
        @test("W")
        model W {
          order: Wrapper<Order>;
          product: Wrapper<Product>;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(W as Model);
      const components = builder.getSchemas();

      expect((components.WrapperOrder.properties as Record<string, any>).label).toEqual({
        type: "string",
        minLength: 3,
      });
      expect((components.WrapperProduct.properties as Record<string, any>).label).toEqual({
        type: "string",
        minLength: 3,
      });
    });
  });

  describe("template instantiation naming and @encodedName properties", () => {
    it("should name a template model instantiation from the template name plus its type argument (Envelope<Order> -> EnvelopeOrder)", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { W } = await runner.compile(t.code`
        model Order {
          id: string;
        }
        model Envelope<T> {
          data: T;
        }
        @test("W")
        model W {
          order: Envelope<Order>;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(W as Model);
      const components = builder.getSchemas();
      const props = components.W.properties as Record<string, any>;

      expect(props.order.$ref).toBe("#/components/schemas/EnvelopeOrder");
      expect(components.EnvelopeOrder).toBeDefined();
      const envelopeSchema = components.EnvelopeOrder as any;
      expect(envelopeSchema.properties.data).toEqual({ $ref: "#/components/schemas/Order" });

      // The same instantiation reached through another field must reuse the
      // exact same key/schema rather than being registered a second time.
      const { W2 } = await runner.compile(t.code`
        model Order {
          id: string;
        }
        model Envelope<T> {
          data: T;
        }
        @test("W2")
        model W2 {
          a: Envelope<Order>;
          b: Envelope<Order>;
        }
      `);
      const builder2 = new SchemaBuilder(runner.program);
      builder2.buildSchema(W2 as Model);
      const props2 = builder2.getSchemas().W2.properties as Record<string, any>;
      expect(props2.a.$ref).toBe(props2.b.$ref);
      expect(
        Object.keys(builder2.getSchemas()).filter((k) => k.startsWith("Envelope")),
      ).toHaveLength(1);
    });

    it('inlines a template instantiation with a string-literal template argument (P<"created">) instead of registering a synthesized name', async () => {
      // A literal has no fixed identity of its own to name the
      // instantiation after. It is unspeakable, matching the official
      // `TypeEmitter.declarationName`'s own behavior: the whole
      // instantiation inlines instead of registering under a synthesized
      // `components.schemas` key.
      const runner = await AsyncAPITester.createInstance();
      const { W } = await runner.compile(t.code`
        model P<T> { v: T; }
        @test("W")
        model W { a: P<"created">; b: P<"deleted">; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(W as Model);
      const components = builder.getSchemas();
      const props = components.W.properties as Record<string, any>;

      expect(props.a).toEqual({
        type: "object",
        properties: { v: { type: "string", enum: ["created"] } },
        required: ["v"],
      });
      expect(props.b).toEqual({
        type: "object",
        properties: { v: { type: "string", enum: ["deleted"] } },
        required: ["v"],
      });
      expect(Object.hasOwn(components, "PCreated")).toBe(false);
      expect(Object.hasOwn(components, "PDeleted")).toBe(false);

      // Swapping the field declaration order must not change the inlined
      // shape; there is no shared key left to race over.
      const { W2 } = await runner.compile(t.code`
        model P<T> { v: T; }
        @test("W2")
        model W2 { b: P<"deleted">; a: P<"created">; }
      `);
      const builder2 = new SchemaBuilder(runner.program);
      builder2.buildSchema(W2 as Model);
      const components2 = builder2.getSchemas();
      const props2 = components2.W2.properties as Record<string, any>;
      expect(props2.a).toEqual(props.a);
      expect(props2.b).toEqual(props.b);
    });

    it("promotes an unspeakable instantiation to a registered component once a second site references it", async () => {
      // Inlining is preferred for a single use. But inlining copies the
      // whole shape into every site that uses it, so nested unspeakable
      // declarations duplicate multiplicatively: a chain where each level
      // references the level below twice grows as 2^depth. Promoting on the
      // second use keeps that growth linear.
      // The first site keeps its inline copy; only later sites resolve to
      // the `$ref`. Both express the same schema.
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model Env<T> { v: T; }
        alias Shared = Env<{ x: string }>;
        @test("M")
        model M { a: Shared; b: Shared; c: Shared; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas();
      const props = components.M.properties as Record<string, any>;

      const inlineShape = {
        type: "object",
        properties: {
          v: { type: "object", properties: { x: { type: "string" } }, required: ["x"] },
        },
        required: ["v"],
      };
      // First use inlines.
      expect(props.a).toEqual(inlineShape);
      // Every later use resolves to the one registered component.
      expect(props.b).toEqual(props.c);
      expect(props.b.$ref).toBeDefined();
      const key = (props.b.$ref as string).replace("#/components/schemas/", "");
      expect(components[key]).toEqual(inlineShape);
      // The body is registered as already built, so a single mistake inside
      // it is never reported twice.
      expect(runner.program.diagnostics).toHaveLength(0);
    });

    it("inlines a template instantiation with a numeric/boolean literal template argument instead of registering a synthesized name", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { W } = await runner.compile(t.code`
        model P<T> { v: T; }
        @test("W")
        model W { c: P<42>; d: P<true>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(W as Model);
      const components = builder.getSchemas();
      const props = components.W.properties as Record<string, any>;

      expect(props.c).toEqual({
        type: "object",
        properties: { v: { type: "number", enum: [42] } },
        required: ["v"],
      });
      expect(props.d).toEqual({
        type: "object",
        properties: { v: { type: "boolean", enum: [true] } },
        required: ["v"],
      });
      expect(Object.hasOwn(components, "P42")).toBe(false);
      expect(Object.hasOwn(components, "PTrue")).toBe(false);
    });

    it("should name a template instantiation from an enum member template argument (P<Color.Red> -> PColorRed)", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { W } = await runner.compile(t.code`
        enum Color { Red, Green }
        model P<T> { v: T; }
        @test("W")
        model W { a: P<Color.Red>; b: P<Color.Green>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(W as Model);
      const components = builder.getSchemas();
      const props = components.W.properties as Record<string, any>;

      expect(props.a.$ref).toBe("#/components/schemas/PColorRed");
      expect(props.b.$ref).toBe("#/components/schemas/PColorGreen");
    });

    it("should name a template union instantiation from the template name plus its type argument (Wrapper<int32> -> WrapperInt32)", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { W } = await runner.compile(t.code`
        union Wrapper<T> { a: T, b: string }
        @test("W")
        model W { x: Wrapper<int32>; y: Wrapper<boolean>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(W as Model);
      const components = builder.getSchemas();
      const props = components.W.properties as Record<string, any>;

      expect(props.x.$ref).toBe("#/components/schemas/WrapperInt32");
      expect(props.y.$ref).toBe("#/components/schemas/WrapperBoolean");

      // Order stability: swap field order, same keys must result.
      const { W2 } = await runner.compile(t.code`
        union Wrapper<T> { a: T, b: string }
        @test("W2")
        model W2 { y: Wrapper<boolean>; x: Wrapper<int32>; }
      `);
      const builder2 = new SchemaBuilder(runner.program);
      builder2.buildSchema(W2 as Model);
      const components2 = builder2.getSchemas();
      const props2 = components2.W2.properties as Record<string, any>;
      expect(props2.x.$ref).toBe("#/components/schemas/WrapperInt32");
      expect(props2.y.$ref).toBe("#/components/schemas/WrapperBoolean");
    });

    it("reports a diagnostic error when a synthesized template-instantiation name collides with a user-declared model's key", async () => {
      // This test used to document a different, superseded policy:
      // first-come-first-served auto-suffixing. Under that old policy, the
      // instantiation reached first via property `a` claimed the bare
      // `EnvelopeOrder` key. The user's own declaration, reached second via
      // property `b`, was silently pushed to a numeric suffix. An
      // architecture review replaced that policy with a hard diagnostic
      // error. This matches `@typespec/openapi3`'s own collision policy.
      // Whichever of the two is built second now reports
      // `duplicate-schema-key` and degrades to the same colliding key,
      // instead of being silently renamed.
      const runner = await AsyncAPITester.createInstance();
      const { W } = await runner.compile(t.code`
        model Order { id: string; }
        model Envelope<T> { data: T; }
        model EnvelopeOrder { x: string; }
        @test("W")
        model W { a: Envelope<Order>; b: EnvelopeOrder; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(W as Model);
      const components = builder.getSchemas();
      const props = components.W.properties as Record<string, any>;

      expect(props.a.$ref).toBe("#/components/schemas/EnvelopeOrder");
      expect(props.b.$ref).toBe("#/components/schemas/EnvelopeOrder");

      const diagnostic = runner.program.diagnostics.find(
        (d) => d.code === "typespec-asyncapi/duplicate-schema-key",
      );
      expect(diagnostic).toBeDefined();
      expect(diagnostic?.severity).toBe("error");
    });

    it("should include the argument's namespace in a template instantiation name so same-named models in different namespaces don't collide", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        namespace A { model Order { a: string; } }
        namespace B { model Order { b: string; } }
        model Envelope<T> { data: T; }
        @test("M")
        model M { x: Envelope<A.Order>; y: Envelope<B.Order>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas();
      const props = components.M.properties as Record<string, any>;

      expect(props.x.$ref).toBe("#/components/schemas/EnvelopeA.Order");
      expect(props.y.$ref).toBe("#/components/schemas/EnvelopeB.Order");

      // Order stability: swap field order, same keys must result.
      const { M2 } = await runner.compile(t.code`
        namespace A { model Order { a: string; } }
        namespace B { model Order { b: string; } }
        model Envelope<T> { data: T; }
        @test("M2")
        model M2 { y: Envelope<B.Order>; x: Envelope<A.Order>; }
      `);
      const builder2 = new SchemaBuilder(runner.program);
      builder2.buildSchema(M2 as Model);
      const components2 = builder2.getSchemas();
      const props2 = components2.M2.properties as Record<string, any>;
      expect(props2.x.$ref).toBe("#/components/schemas/EnvelopeA.Order");
      expect(props2.y.$ref).toBe("#/components/schemas/EnvelopeB.Order");
    });

    it("should join a multi-level namespace chain with '.' so it doesn't collide with a differently-nested sibling namespace of the concatenated name", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        namespace A.B { model Order { id: string; } }
        namespace AB { model Order { other: string; } }
        model Envelope<T> { data: T; }
        @test("M")
        model M { x: Envelope<A.B.Order>; y: Envelope<AB.Order>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas();
      const props = components.M.properties as Record<string, any>;

      expect(props.x.$ref).toBe("#/components/schemas/EnvelopeA.B.Order");
      expect(props.y.$ref).toBe("#/components/schemas/EnvelopeAB.Order");

      // Order stability: swap field order, same keys must result.
      const { M2 } = await runner.compile(t.code`
        namespace A.B { model Order { id: string; } }
        namespace AB { model Order { other: string; } }
        model Envelope<T> { data: T; }
        @test("M2")
        model M2 { y: Envelope<AB.Order>; x: Envelope<A.B.Order>; }
      `);
      const builder2 = new SchemaBuilder(runner.program);
      builder2.buildSchema(M2 as Model);
      const components2 = builder2.getSchemas();
      const props2 = components2.M2.properties as Record<string, any>;
      expect(props2.x.$ref).toBe("#/components/schemas/EnvelopeA.B.Order");
      expect(props2.y.$ref).toBe("#/components/schemas/EnvelopeAB.Order");
    });

    it("inlines distinct string-literal template arguments to their own literal shape instead of composing a synthesized name", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model P<T> { v: T; }
        @test("M")
        model M { a: P<"user-created">; b: P<"user_created">; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas();
      const props = components.M.properties as Record<string, any>;

      expect(props.a).toEqual({
        type: "object",
        properties: { v: { type: "string", enum: ["user-created"] } },
        required: ["v"],
      });
      expect(props.b).toEqual({
        type: "object",
        properties: { v: { type: "string", enum: ["user_created"] } },
        required: ["v"],
      });
      expect(props.a).not.toEqual(props.b);
      expect(Object.keys(components)).toEqual(["M"]);

      // Degenerate case: an empty literal and a lone separator still inline
      // to their own distinct literal shape.
      const { M2 } = await runner.compile(t.code`
        model P<T> { v: T; }
        @test("M2")
        model M2 { a: P<"">; b: P<"-">; }
      `);
      const builder2 = new SchemaBuilder(runner.program);
      builder2.buildSchema(M2 as Model);
      const components2 = builder2.getSchemas();
      const props2 = components2.M2.properties as Record<string, any>;
      expect(props2.a).toEqual({
        type: "object",
        properties: { v: { type: "string", enum: [""] } },
        required: ["v"],
      });
      expect(props2.b).toEqual({
        type: "object",
        properties: { v: { type: "string", enum: ["-"] } },
        required: ["v"],
      });
    });

    it("should include the argument's namespace for enum/scalar/union template arguments too, not just Model", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        namespace A { enum Status { Ok } }
        namespace B { enum Status { No } }
        model Envelope<T> { data: T; }
        @test("M")
        model M { x: Envelope<A.Status>; y: Envelope<B.Status>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas();
      const props = components.M.properties as Record<string, any>;

      expect(props.x.$ref).toBe("#/components/schemas/EnvelopeA.Status");
      expect(props.y.$ref).toBe("#/components/schemas/EnvelopeB.Status");

      // Order stability: swap field order, same keys must result.
      const { M2 } = await runner.compile(t.code`
        namespace A { enum Status { Ok } }
        namespace B { enum Status { No } }
        model Envelope<T> { data: T; }
        @test("M2")
        model M2 { y: Envelope<B.Status>; x: Envelope<A.Status>; }
      `);
      const builder2 = new SchemaBuilder(runner.program);
      builder2.buildSchema(M2 as Model);
      const components2 = builder2.getSchemas();
      const props2 = components2.M2.properties as Record<string, any>;
      expect(props2.x.$ref).toBe("#/components/schemas/EnvelopeA.Status");
      expect(props2.y.$ref).toBe("#/components/schemas/EnvelopeB.Status");

      // Same instability for scalar arguments.
      const { M3 } = await runner.compile(t.code`
        namespace A { scalar Email extends string; }
        namespace B { scalar Email extends string; }
        model Envelope2<T> { data: T; }
        @test("M3")
        model M3 { x: Envelope2<A.Email>; y: Envelope2<B.Email>; }
      `);
      const builder3 = new SchemaBuilder(runner.program);
      builder3.buildSchema(M3 as Model);
      const components3 = builder3.getSchemas();
      const props3 = components3.M3.properties as Record<string, any>;
      expect(props3.x.$ref).toBe("#/components/schemas/Envelope2A.Email");
      expect(props3.y.$ref).toBe("#/components/schemas/Envelope2B.Email");
    });

    it("Sep-encodes a backtick-declared scalar template argument's own name so it can't leak a character outside the AsyncAPI key charset", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        scalar \`a/b\` extends string;
        scalar \`c#d\` extends string;
        model Env<T> { d: T; }
        @test("M")
        model M { x: Env<\`a/b\`>; y: Env<\`c#d\`>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas() as Record<string, any>;
      const props = components.M.properties as Record<string, any>;

      for (const ref of [props.x.$ref, props.y.$ref] as string[]) {
        expect(ref.split("#")).toHaveLength(2);
        const key = ref.replace("#/components/schemas/", "");
        expect(key).toMatch(/^[a-zA-Z0-9.\-_]+$/);
        expect(Object.hasOwn(components, key)).toBe(true);
      }
      expect(props.x.$ref).toBe("#/components/schemas/EnvASep47B");
      expect(props.y.$ref).toBe("#/components/schemas/EnvCSep35D");
    });

    it("inlines a string-literal template argument with unsafe separator characters instead of needing an escaped $ref", async () => {
      // A literal argument is unspeakable regardless of which characters it
      // carries, so `#`, `/`, and a space here never need to reach a
      // `components.schemas` key or an escaped $ref at all: the whole
      // instantiation inlines with the literal's own raw text in `enum`.
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model P<T> { v: T; }
        @test("M")
        model M { a: P<"user#created">; b: P<"a/b">; c: P<"has space">; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas();
      const props = components.M.properties as Record<string, any>;

      expect(props.a).toEqual({
        type: "object",
        properties: { v: { type: "string", enum: ["user#created"] } },
        required: ["v"],
      });
      expect(props.b).toEqual({
        type: "object",
        properties: { v: { type: "string", enum: ["a/b"] } },
        required: ["v"],
      });
      expect(props.c).toEqual({
        type: "object",
        properties: { v: { type: "string", enum: ["has space"] } },
        required: ["v"],
      });
      expect(Object.keys(components)).toEqual(["M"]);
    });

    it("should not leak the built-in TypeSpec namespace into a template instantiation name for Array/Record arguments", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model Order { id: string; }
        model Envelope<T> { data: T; }
        @test("M")
        model M { a: Envelope<Order[]>; b: Envelope<Record<string>>; c: Envelope<string[]>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas();
      const props = components.M.properties as Record<string, any>;

      expect(props.a.$ref).toBe("#/components/schemas/EnvelopeArrayOrder");
      expect(props.b.$ref).toBe("#/components/schemas/EnvelopeRecordString");
      expect(props.c.$ref).toBe("#/components/schemas/EnvelopeArrayString");
    });

    it("inlines a numeric-literal template argument to its own literal shape instead of composing a synthesized name", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model P<T> { v: T; }
        @test("M")
        model M { a: P<1>; b: P<-1>; c: P<1.5>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas();
      const props = components.M.properties as Record<string, any>;

      expect(props.a).toEqual({
        type: "object",
        properties: { v: { type: "number", enum: [1] } },
        required: ["v"],
      });
      expect(props.b).toEqual({
        type: "object",
        properties: { v: { type: "number", enum: [-1] } },
        required: ["v"],
      });
      expect(props.c).toEqual({
        type: "object",
        properties: { v: { type: "number", enum: [1.5] } },
        required: ["v"],
      });
      expect(Object.keys(components)).toEqual(["M"]);
    });

    it("distinguishes a tuple template argument from the unknown intrinsic: unknown stays a named instantiation, a tuple argument inlines", async () => {
      // `unknown` is an `Intrinsic` with a fixed name; it stays speakable.
      // A `Tuple`, like `[string, int32]`, has no fixed identity of its own
      // (matching the official `TypeEmitter.declarationName`'s own handling
      // of a `Tuple` argument), so the whole instantiation inlines instead.
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model P<T> { v: T; }
        @test("M")
        model M { a: P<unknown>; b: P<[string, int32]>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas();
      const props = components.M.properties as Record<string, any>;

      expect(props.a.$ref).toBe("#/components/schemas/PUnknown");
      expect(props.b.$ref).toBeUndefined();
      expect(props.b.type).toBe("object");
      // The compiler substitutes the bare Tuple type directly for `T`.
      // `buildSchema` has no representation for a bare Tuple value; it
      // degrades to `{}` and reports the pre-existing
      // `unsupported-payload-type` diagnostic, the same as any other
      // unsupported payload type.
      expect(props.b.properties.v).toEqual({});
      const diagnostic = runner.program.diagnostics.find(
        (d) => d.code === "typespec-asyncapi/unsupported-payload-type",
      );
      expect(diagnostic).toBeDefined();
    });

    it("distinguishes a tuple template argument from its bare element type: the bare type stays a named instantiation, the tuple argument inlines", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model P<T> { v: T; }
        @test("M")
        model M { a: P<string>; b: P<[string]>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas();
      const props = components.M.properties as Record<string, any>;

      expect(props.a.$ref).toBe("#/components/schemas/PString");
      expect(props.b.$ref).toBeUndefined();
      expect(props.b.type).toBe("object");
      expect(props.b.properties.v).toEqual({});

      const runnerReversed = await AsyncAPITester.createInstance();
      const { M: M2 } = await runnerReversed.compile(t.code`
        model P<T> { v: T; }
        @test("M")
        model M { b: P<[string]>; a: P<string>; }
      `);
      const builder2 = new SchemaBuilder(runnerReversed.program);
      builder2.buildSchema(M2 as Model);
      const props2 = builder2.getSchemas().M.properties as Record<string, any>;

      expect(props2.a.$ref).toBe("#/components/schemas/PString");
      expect(props2.b).toEqual(props.b);
    });

    it("inlines a template instantiation with an anonymous model/union template argument instead of registering a synthesized name, stably regardless of field order", async () => {
      // An anonymous `Model`/`Union` has no fixed identity of its own to name
      // the instantiation after. It is unspeakable, so the whole
      // instantiation inlines with the argument's own shape substituted in.
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model Envelope<T> { data: T; }
        @test("M")
        model M { a: Envelope<{x: string}>; b: Envelope<{y: int32}>; c: Envelope<string | int32>; d: Envelope<boolean | null>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas();
      const props = components.M.properties as Record<string, any>;

      expect(props.a).toEqual({
        type: "object",
        properties: {
          data: { type: "object", properties: { x: { type: "string" } }, required: ["x"] },
        },
        required: ["data"],
      });
      expect(props.b).toEqual({
        type: "object",
        properties: {
          data: {
            type: "object",
            properties: { y: { type: "integer", format: "int32" } },
            required: ["y"],
          },
        },
        required: ["data"],
      });
      expect(props.c).toEqual({
        type: "object",
        properties: {
          data: { anyOf: [{ type: "string" }, { type: "integer", format: "int32" }] },
        },
        required: ["data"],
      });
      expect(props.d).toEqual({
        type: "object",
        properties: { data: { anyOf: [{ type: "boolean" }, { type: "null" }] } },
        required: ["data"],
      });
      expect(Object.keys(components)).toEqual(["M"]);

      // Order stability: swapping field order must not change the inlined
      // shape; nothing here depends on visitation order any more.
      const runnerReversed = await AsyncAPITester.createInstance();
      const { M: M2 } = await runnerReversed.compile(t.code`
        model Envelope<T> { data: T; }
        @test("M")
        model M { b: Envelope<{y: int32}>; a: Envelope<{x: string}>; d: Envelope<boolean | null>; c: Envelope<string | int32>; }
      `);
      const builder2 = new SchemaBuilder(runnerReversed.program);
      builder2.buildSchema(M2 as Model);
      const props2 = builder2.getSchemas().M.properties as Record<string, any>;

      expect(props2.a).toEqual(props.a);
      expect(props2.b).toEqual(props.b);
      expect(props2.c).toEqual(props.c);
      expect(props2.d).toEqual(props.d);
    });

    it("inlines two structurally-identical anonymous-model template arguments independently instead of needing a collision diagnostic", async () => {
      // Two separate anonymous-model type arguments with the same shape
      // (`{x: string}`) are distinct `Type` objects, but each is unspeakable
      // on its own terms (see `templateArgDisplayName`). Each instantiation
      // now inlines independently. There is no shared synthesized key left
      // for the two to collide over, so no diagnostic is reported even
      // though the two inlined shapes are structurally identical.
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model Envelope<T> { data: T; }
        @test("M")
        model M { a: Envelope<{x: string}>; b: Envelope<{x: string}>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const props = builder.getSchemas().M.properties as Record<string, any>;

      const expected = {
        type: "object",
        properties: {
          data: { type: "object", properties: { x: { type: "string" } }, required: ["x"] },
        },
        required: ["data"],
      };
      expect(props.a).toEqual(expected);
      expect(props.b).toEqual(expected);
      expect(Object.keys(builder.getSchemas())).toEqual(["M"]);

      const diagnostic = runner.program.diagnostics.find(
        (d) => d.code === "typespec-asyncapi/duplicate-schema-key",
      );
      expect(diagnostic).toBeUndefined();
    });

    it("inlines a string-literal template argument's distinct separator characters to their own literal shape instead of composing a synthesized name", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model P<T> { v: T; }
        @test("M")
        model M { a: P<"a b">; b: P<"a#b">; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const props = builder.getSchemas().M.properties as Record<string, any>;

      expect(props.a).toEqual({
        type: "object",
        properties: { v: { type: "string", enum: ["a b"] } },
        required: ["v"],
      });
      expect(props.b).toEqual({
        type: "object",
        properties: { v: { type: "string", enum: ["a#b"] } },
        required: ["v"],
      });
      expect(props.a).not.toEqual(props.b);
    });

    it("inlines a numeric template argument in exponent form to its own literal shape instead of needing a safe schema key", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model P<T> { v: T; }
        @test("M")
        model M { a: P<100000000000000000000000>; b: P<1e21>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas();
      const props = components.M.properties as Record<string, any>;

      expect(props.a).toEqual({
        type: "object",
        properties: { v: { type: "number", enum: [1e23] } },
        required: ["v"],
      });
      expect(props.b).toEqual({
        type: "object",
        properties: { v: { type: "number", enum: [1e21] } },
        required: ["v"],
      });
      expect(props.a).not.toEqual(props.b);
      expect(Object.keys(components)).toEqual(["M"]);
    });

    it("inlines anonymous-model template arguments independently, keeping distinct property types, stably regardless of field order", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model Envelope<T> { data: T; }
        @test("M")
        model M { a: Envelope<{x: string}>; b: Envelope<{x: int32}>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const props = builder.getSchemas().M.properties as Record<string, any>;

      expect(props.a).not.toEqual(props.b);
      expect(props.a.properties.data.properties.x).toEqual({ type: "string" });
      expect(props.b.properties.data.properties.x).toEqual({
        type: "integer",
        format: "int32",
      });

      const runnerReversed = await AsyncAPITester.createInstance();
      const { M: M2 } = await runnerReversed.compile(t.code`
        model Envelope<T> { data: T; }
        @test("M")
        model M { b: Envelope<{x: int32}>; a: Envelope<{x: string}>; }
      `);
      const builder2 = new SchemaBuilder(runnerReversed.program);
      builder2.buildSchema(M2 as Model);
      const props2 = builder2.getSchemas().M.properties as Record<string, any>;

      expect(props2.a).toEqual(props.a);
      expect(props2.b).toEqual(props.b);
    });

    it("inlines a literal that spells the Sep escape marker distinct from a literal using the real separator it once encoded, stably regardless of field order", async () => {
      // Sep-encoding no longer applies here: a literal template argument is
      // unspeakable and inlines with its own raw text in `enum`. `"a b"` and
      // `"ASep32B"` are just two different literal values now, distinct
      // because their raw text differs, not because of any escape scheme.
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model P<T> { v: T; }
        @test("M")
        model M { a: P<"a b">; b: P<"ASep32B">; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const props = builder.getSchemas().M.properties as Record<string, any>;

      expect(props.a).toEqual({
        type: "object",
        properties: { v: { type: "string", enum: ["a b"] } },
        required: ["v"],
      });
      expect(props.b).toEqual({
        type: "object",
        properties: { v: { type: "string", enum: ["ASep32B"] } },
        required: ["v"],
      });
      expect(props.a).not.toEqual(props.b);

      const runnerReversed = await AsyncAPITester.createInstance();
      const { M: M2 } = await runnerReversed.compile(t.code`
        model P<T> { v: T; }
        @test("M")
        model M { b: P<"ASep32B">; a: P<"a b">; }
      `);
      const builder2 = new SchemaBuilder(runnerReversed.program);
      builder2.buildSchema(M2 as Model);
      const props2 = builder2.getSchemas().M.properties as Record<string, any>;

      expect(props2.a).toEqual(props.a);
      expect(props2.b).toEqual(props.b);
    });

    it("inlines a string-template template argument whether or not the compiler reduced it, matching the plain string-literal argument next to it", async () => {
      // A string template is a literal value, so it has no fixed identity to
      // name an instantiation after. It inlines, exactly like the plain
      // string literal `a` uses. A reduced template and a plain literal of
      // the same text must not disagree: one cannot inline while the other
      // registers a synthesized `components.schemas` key.
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model P<T> { v: T; }
        @test("M")
        model M { a: P<"abc">; b: P<"a\${"b"}c">; c: P<"x-\${"y"}">; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas();
      const props = components.M.properties as Record<string, any>;

      // Only `M` itself is registered. No `PAbc` or similar key exists.
      expect(Object.keys(components)).toEqual(["M"]);

      expect(props.a).toEqual({
        type: "object",
        properties: { v: { type: "string", enum: ["abc"] } },
        required: ["v"],
      });
      // A string template carries no schema mapping of its own yet, so the
      // inlined property degrades to the unconstrained schema. The key point
      // here is that it inlines rather than claiming a named component.
      expect(props.b).toEqual({
        type: "object",
        properties: { v: {} },
        required: ["v"],
      });
      expect(props.c).toEqual(props.b);
    });

    it("inlines a whole nested instantiation chain when only the innermost template argument is unspeakable", async () => {
      // `Inner<{x: string}>` is unspeakable, so `Outer<Inner<{x: string}>>`
      // is too: unspeakability propagates outward through every level. The
      // speakable `Outer<Inner<string>>` next to it still registers both of
      // its levels, so the propagation is not over-eager.
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model Inner<T> { i: T; }
        model Outer<T> { o: T; }
        @test("M")
        model M { a: Outer<Inner<{x: string}>>; b: Outer<Inner<string>>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas();
      const props = components.M.properties as Record<string, any>;

      expect(Object.keys(components).sort()).toEqual(["InnerString", "M", "OuterInnerString"]);
      expect(props.a).toEqual({
        type: "object",
        properties: {
          o: {
            type: "object",
            properties: {
              i: { type: "object", properties: { x: { type: "string" } }, required: ["x"] },
            },
            required: ["i"],
          },
        },
        required: ["o"],
      });
      expect(props.b).toEqual({ $ref: "#/components/schemas/OuterInnerString" });
    });

    it("inlines instantiations taking a const value argument instead of making two distinct consts claim one key", async () => {
      // A value has no nameable identity of its own. Naming both
      // instantiations after a fixed placeholder would turn valid TypeSpec
      // into a `duplicate-schema-key` error.
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model P<T extends valueof string> { v: string; }
        const c1: string = "one";
        const c2: string = "two";
        @test("M")
        model M { a: P<c1>; b: P<c2>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas();
      const props = components.M.properties as Record<string, any>;

      expect(Object.keys(components)).toEqual(["M"]);
      const inlined = {
        type: "object",
        properties: { v: { type: "string" } },
        required: ["v"],
      };
      expect(props.a).toEqual(inlined);
      expect(props.b).toEqual(inlined);
    });

    it("registers a self-recursive instantiation with an anonymous-model argument instead of inlining it into a circular-reference error", async () => {
      // `Node<{x: string}>` has no composable structural name, so the
      // default is to inline it. A self-recursive instantiation cannot be
      // expressed inline: expanding it always leaves another self-reference
      // behind. So it is promoted to a real `components.schemas` entry under
      // the `getTypeName`-derived fallback name, and `children.items`
      // resolves to a genuine self-`$ref`.
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model Node<T> { v: T; children: Node<T>[]; }
        @test("M")
        model M { a: Node<{x: string}>; b: Node<string>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas();
      const props = components.M.properties as Record<string, any>;

      // The speakable neighbour keeps its compact composed name.
      expect(props.b.$ref).toBe("#/components/schemas/NodeString");

      // The fallback key is the compact shape with each template argument
      // replaced by the Sep-encoded official `getEntityName` text of that
      // argument, here `{ x: string }`.
      const key = "NodeSep123Sep32XSep58Sep32StringSep32Sep125";
      const selfRef = `#/components/schemas/${key}`;
      expect(props.a.$ref).toBe(selfRef);
      const promoted = components[key] as any;
      expect(promoted).toBeDefined();
      expect(promoted.properties.v).toEqual({
        type: "object",
        properties: { x: { type: "string" } },
        required: ["x"],
      });
      expect(promoted.properties.children).toEqual({
        type: "array",
        items: { $ref: selfRef },
      });

      expect(
        runner.program.diagnostics.filter(
          (d) => d.code === "typespec-asyncapi/unrepresentable-circular-reference",
        ),
      ).toEqual([]);
    });

    it("reports a duplicate-schema-key error when two self-recursive instantiations with structurally identical anonymous-model arguments resolve to one fallback key", async () => {
      // Two separately written `{x: string}` arguments are two distinct
      // anonymous models, so `a` and `b` are two distinct instantiations.
      // The fallback name is built from each argument's official
      // `getEntityName` text, which is identical for both. So they land on
      // one key. That is a hard error, the same collision policy every other
      // candidate-name clash gets, rather than a silent rename.
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model Node<T> { v: T; children: Node<T>[]; }
        @test("M")
        model M { a: Node<{x: string}>; b: Node<{x: string}>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas();
      const props = components.M.properties as Record<string, any>;

      const key = "NodeSep123Sep32XSep58Sep32StringSep32Sep125";
      expect(props.a.$ref).toBe(`#/components/schemas/${key}`);
      expect(props.b.$ref).toBe(`#/components/schemas/${key}`);
      expect(components[key]).toBeDefined();

      const duplicates = runner.program.diagnostics.filter(
        (d) => d.code === "typespec-asyncapi/duplicate-schema-key",
      );
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].severity).toBe("error");
    });

    it("reports a diagnostic once, not twice, when a self-recursive instantiation is promoted after an inline attempt", async () => {
      // `Node<{x: string}>` is first attempted inline, then promoted to a
      // registered component once it re-enters itself. The shape built by
      // that attempt is registered as-is, so the body is built exactly once
      // and the unsupported `Iface` property is reported once. The speakable
      // neighbour `Node<string>` never inlines and gives the baseline count.
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        interface Iface { doThing(): void; }
        model Node<T> { v: T; bad: Iface; children: Node<T>[]; }
        @test("M")
        model M { a: Node<{x: string}>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);

      expect(
        runner.program.diagnostics.filter(
          (d) => d.code === "typespec-asyncapi/unsupported-payload-type",
        ),
      ).toHaveLength(1);
    });

    it("reports a diagnostic once when two properties reference the same promoted self-recursive instantiation", async () => {
      // The `alias` makes both properties resolve to one `Node<{x: string}>`
      // Type instance. The first reference promotes it to a component. The
      // second must reuse that cached declaration instead of rebuilding the
      // body and re-reporting every diagnostic of the first attempt.
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        interface Iface { doThing(): void; }
        model Node<T> { v: T; bad: Iface; children: Node<T>[]; }
        alias N = Node<{x: string}>;
        @test("M")
        model M { a: N; b: N; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);

      expect(
        runner.program.diagnostics.filter(
          (d) => d.code === "typespec-asyncapi/unsupported-payload-type",
        ),
      ).toHaveLength(1);

      // Both properties resolve to the one registered component.
      const components = builder.getSchemas() as Record<string, any>;
      const props = components.M.properties as Record<string, any>;
      expect(props.a.$ref).toBe(props.b.$ref);
      const key = String(props.a.$ref).replace("#/components/schemas/", "");
      expect(Object.hasOwn(components, key)).toBe(true);
    });

    it("reports a missing-discriminator-property diagnostic once for a promoted self-recursive instantiation", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        @discriminator("kind")
        model Node<T> { v: T; children: Node<T>[]; }
        @test("M")
        model M { a: Node<{x: string}>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);

      expect(
        runner.program.diagnostics.filter(
          (d) => d.code === "typespec-asyncapi/missing-discriminator-property",
        ),
      ).toHaveLength(1);
    });

    it("inlines instantiations taking an operation type argument instead of making two distinct operations claim one key", async () => {
      // An `Operation` argument is not one of the handled, nameable kinds.
      // It has no fixed identity to compose a key from, so the instantiation
      // is unspeakable and inlines, exactly like a value or a literal
      // argument. Naming both instantiations after one fixed placeholder
      // would turn valid TypeSpec into a `duplicate-schema-key` error.
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        op opA(): void;
        op opB(): void;
        model P<T extends TypeSpec.Reflection.Operation> { v: string; }
        @test("M")
        model M { a: P<opA>; b: P<opB>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas();
      const props = components.M.properties as Record<string, any>;

      expect(Object.keys(components)).toEqual(["M"]);
      const inlined = {
        type: "object",
        properties: { v: { type: "string" } },
        required: ["v"],
      };
      expect(props.a).toEqual(inlined);
      expect(props.b).toEqual(inlined);
      expect(
        runner.program.diagnostics.filter(
          (d) => d.code === "typespec-asyncapi/duplicate-schema-key",
        ),
      ).toEqual([]);
    });

    it("keeps two self-recursive union instantiations with anonymous-model arguments under separate keys", async () => {
      // The official `getTypeName` drops a union's template arguments, so
      // the fallback name is composed per argument instead. Two recursive
      // instantiations of one template union therefore stay apart rather
      // than colliding on the bare template name.
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        union Chain<T> { head: T, next: Chain<T> }
        @test("M")
        model M { a: Chain<{x: string}>; b: Chain<{y: int32}>; }
      `);
      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas();
      const props = components.M.properties as Record<string, any>;

      const keyA = "ChainSep123Sep32XSep58Sep32StringSep32Sep125";
      const keyB = "ChainSep123Sep32YSep58Sep32Int32Sep32Sep125";
      expect(props.a.$ref).toBe(`#/components/schemas/${keyA}`);
      expect(props.b.$ref).toBe(`#/components/schemas/${keyB}`);
      expect((components[keyA] as any).anyOf).toEqual([
        { type: "object", properties: { x: { type: "string" } }, required: ["x"] },
        { $ref: `#/components/schemas/${keyA}` },
      ]);
      expect((components[keyB] as any).anyOf).toEqual([
        {
          type: "object",
          properties: { y: { type: "integer", format: "int32" } },
          required: ["y"],
        },
        { $ref: `#/components/schemas/${keyB}` },
      ]);

      expect(
        runner.program.diagnostics.filter(
          (d) =>
            d.code === "typespec-asyncapi/unrepresentable-circular-reference" ||
            d.code === "typespec-asyncapi/duplicate-schema-key",
        ),
      ).toEqual([]);
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

    it("should Sep-encode a backtick-declared model's own name so it can't leak a character outside the AsyncAPI key charset", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        model \`Foo/Bar\` { x: string; }
        @test("M")
        model M { field: \`Foo/Bar\`; }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const props = builder.getSchemas().M.properties as Record<string, any>;
      const key = String(props.field.$ref).replace("#/components/schemas/", "");

      expect(key).toMatch(/^[a-zA-Z0-9.\-_]+$/);
      expect(Object.hasOwn(builder.getSchemas(), key)).toBe(true);
      // '/' (code point 47) is Sep-encoded the same way it already is for a
      // literal template argument's own text.
      expect(key).toBe("FooSep47Bar");
    });

    it("should Sep-encode a backtick-declared enum's own name so it can't leak a character outside the AsyncAPI key charset", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        enum \`Foo/Bar\` { A, B }
        @test("M")
        model M { field: \`Foo/Bar\`; }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const props = builder.getSchemas().M.properties as Record<string, any>;
      const key = String(props.field.$ref).replace("#/components/schemas/", "");

      expect(key).toMatch(/^[a-zA-Z0-9.\-_]+$/);
      expect(Object.hasOwn(builder.getSchemas(), key)).toBe(true);
    });

    it("should use @friendlyName's resolved, interpolated name as the components.schemas key for a template instantiation", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { W } = await runner.compile(t.code`
        @friendlyName("{name}Envelope", T)
        model Envelope<T> {
          data: T;
        }
        model Order {
          id: string;
        }
        @test("W")
        model W {
          order: Envelope<Order>;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(W as Model);
      const components = builder.getSchemas();
      const props = components.W.properties as Record<string, any>;

      // `@friendlyName("{name}Envelope")` resolves `{name}` to the type
      // argument's own name, `Order`, giving `OrderEnvelope` rather than the
      // structural `EnvelopeOrder`.
      expect(props.order.$ref).toBe("#/components/schemas/OrderEnvelope");
      expect(components.OrderEnvelope).toBeDefined();
      expect(components.EnvelopeOrder).toBeUndefined();
    });

    it("should report duplicate-schema-key when two template instantiations resolve to the same @friendlyName", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { W } = await runner.compile(t.code`
        @friendlyName("Wrapped")
        model Envelope<T> {
          data: T;
        }
        model Order { id: string; }
        model Invoice { id: string; }
        @test("W")
        model W {
          order: Envelope<Order>;
          invoice: Envelope<Invoice>;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(W as Model);
      const diagnostic = runner.program.diagnostics.find(
        (d) => d.code === "typespec-asyncapi/duplicate-schema-key",
      );
      expect(diagnostic).toBeDefined();
      expect(diagnostic?.severity).toBe("error");
    });

    it("should still use the structural name for a template instantiation with no @friendlyName", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { W } = await runner.compile(t.code`
        model Envelope<T> {
          data: T;
        }
        model Order {
          id: string;
        }
        @test("W")
        model W {
          order: Envelope<Order>;
        }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(W as Model);
      const components = builder.getSchemas();
      const props = components.W.properties as Record<string, any>;

      expect(props.order.$ref).toBe("#/components/schemas/EnvelopeOrder");
      expect(components.EnvelopeOrder).toBeDefined();
    });

    it("should use @friendlyName's resolved name as the components.schemas key for an enum", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { M } = await runner.compile(t.code`
        @friendlyName("Renamed")
        enum Color { Red, Green }
        @test("M")
        model M { color: Color; }
      `);

      const builder = new SchemaBuilder(runner.program);
      builder.buildSchema(M as Model);
      const components = builder.getSchemas();
      const props = components.M.properties as Record<string, any>;

      expect(props.color.$ref).toBe("#/components/schemas/Renamed");
      expect(components.Renamed).toBeDefined();
      expect(components.Color).toBeUndefined();
    });
  });
});
