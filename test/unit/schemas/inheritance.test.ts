/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect } from "vitest";
import { AsyncAPITester } from "../../../src/testing/index.js";
import { compileSchemas } from "../../utils/schema-host.js";
import { t } from "@typespec/compiler/testing";
import { SchemaBuilder } from "../../../src/builders/schemas/builder.js";

describe("Unit: Schemas — inheritance and discriminator", () => {
  it("should build `model B extends A` as `allOf: [{ $ref: A }, own]`, registering both models", async () => {
    const { builder, Derived } = await compileSchemas(t.code`
      model Base { a: string; }
      model ${t.model("Derived")} extends Base { b: int32; }
    `);
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
    const { builder, M } = await compileSchemas(t.code`
      model Base { a: string; }
      model ${t.model("M")} { ...Base; b: int32; }
    `);
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
    const { builder, Pet, Cat, Dog } = await compileSchemas(t.code`
      @discriminator("kind")
      model ${t.model("Pet")} { kind: string; }
      model ${t.model("Cat")} extends Pet { kind: "cat"; lives: int32; }
      model ${t.model("Dog")} extends Pet { kind: "dog"; }
    `);
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
    const { builder, Pet, Dog, Poodle } = await compileSchemas(t.code`
      @discriminator("kind")
      model ${t.model("Pet")} { kind: string; }
      @discriminator("breed")
      model ${t.model("Dog")} extends Pet { kind: "dog"; breed: string; }
      model ${t.model("Poodle")} extends Dog { breed: "poodle"; }
    `);
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
    const { builder, program, Pet } = await compileSchemas(t.code`
      @discriminator("kind")
      model ${t.model("Pet")} { name: string; }
    `);
    builder.buildSchema(Pet);

    const components = builder.getSchemas();
    expect((components.Pet as any).discriminator).toBeUndefined();
    expect(
      program.diagnostics.some((d) => d.code === "tsp-asyncapi/missing-discriminator-property"),
    ).toBe(true);
  });

  it("should report a diagnostic and omit discriminator when the discriminating property is optional", async () => {
    const { builder, program, Pet } = await compileSchemas(t.code`
      @discriminator("kind")
      model ${t.model("Pet")} { kind?: string; }
    `);
    builder.buildSchema(Pet);

    const components = builder.getSchemas();
    expect((components.Pet as any).discriminator).toBeUndefined();
    expect(
      program.diagnostics.some((d) => d.code === "tsp-asyncapi/optional-discriminator-property"),
    ).toBe(true);
  });

  it("should match the discriminating property by its TypeSpec name and emit the wire name as discriminator", async () => {
    const { builder, program, Pet } = await compileSchemas(t.code`
      @discriminator("kind")
      model ${t.model("Pet")} {
        @encodedName("application/json", "petType")
        kind: string;
        name: string;
      }
    `);
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
      program.diagnostics.some((d) => d.code === "tsp-asyncapi/missing-discriminator-property"),
    ).toBe(false);
  });

  it("should emit discriminator when the discriminating property is inherited from baseModel", async () => {
    const { builder, Mid } = await compileSchemas(t.code`
      model Base { kind: string; }
      @discriminator("kind")
      model ${t.model("Mid")} extends Base { name: string; }
    `);
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
    const { builder, program, Pet } = await compileSchemas(t.code`
      @discriminator("kind")
      model ${t.model("Pet")} { kind: never; name: string; }
    `);
    builder.buildSchema(Pet);

    const components = builder.getSchemas();
    expect((components.Pet as any).discriminator).toBeUndefined();
    expect(
      program.diagnostics.some((d) => d.code === "tsp-asyncapi/missing-discriminator-property"),
    ).toBe(true);
  });

  it("should preserve a named collection-backed base's validation keywords and docs when extended", async () => {
    const { builder, Pets } = await compileSchemas(t.code`
      @doc("names doc")
      @minItems(1)
      model Names is string[];
      model ${t.model("Pets")} extends Names {}
    `);
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
    const { builder, Pets } = await compileSchemas(t.code`
      model Pet { name: string; }
      model ${t.model("Pets")} extends Array<Pet> { }
    `);
    builder.buildSchema(Pets);

    const components = builder.getSchemas();
    expect(components.Pets).toEqual({
      type: "array",
      items: { $ref: "#/components/schemas/Pet" },
    });
  });

  it("should return the base's collection shape (not a noisy allOf) when extends a record-backed model", async () => {
    const { builder, Bag } = await compileSchemas(t.code`
      model ${t.model("Bag")} extends Record<string> { }
    `);
    builder.buildSchema(Bag);

    const components = builder.getSchemas();
    expect(components.Bag).toEqual({
      type: "object",
      additionalProperties: { type: "string" },
    });
  });

  it("should keep own properties when extending an anonymous Record base", async () => {
    const { builder, Bag } = await compileSchemas(t.code`
      model ${t.model("Bag")} extends Record<unknown> { count: int32; name: string; }
    `);
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
    const { builder, Bag } = await compileSchemas(t.code`
      model Props is Record<unknown>;
      model ${t.model("Bag")} extends Props { count: int32; }
    `);
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
    const { builder, Bag } = await compileSchemas(t.code`
      model ${t.model("Bag")} extends Record<string> { extra: string; }
    `);
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
    const { builder, Bag } = await compileSchemas(t.code`
      model ${t.model("Bag")} { id: string; ...Record<string>; }
    `);
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
    const { builder, Bag } = await compileSchemas(t.code`
      @discriminator("kind")
      model ${t.model("Bag")} extends Record<string> { kind: string; }
    `);
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
    const { builder, Mid } = await compileSchemas(t.code`
      model Base { kind: string; }
      @discriminator("kind")
      model ${t.model("Mid")} extends Base { }
    `);
    builder.buildSchema(Mid);

    const components = builder.getSchemas();
    expect(components.Mid).toEqual({
      allOf: [{ $ref: "#/components/schemas/Base" }],
      discriminator: "kind",
    });
  });

  it("should omit the empty own-shape branch when a derived model adds no properties of its own", async () => {
    const { builder, Derived } = await compileSchemas(t.code`
      model Base { a: string; }
      model ${t.model("Derived")} extends Base { }
    `);
    builder.buildSchema(Derived);

    const components = builder.getSchemas();
    expect(components.Derived).toEqual({
      allOf: [{ $ref: "#/components/schemas/Base" }],
    });
  });

  it("should flatten (not allOf) a derived model whose override property has a different @encodedName than the inherited one", async () => {
    const { builder, program, Cat } = await compileSchemas(t.code`
      model Pet { kind: string; }
      model ${t.model("Cat")} extends Pet {
        @encodedName("application/json", "k")
        kind: "cat";
      }
    `);
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
    const overrideDiagnostic = program.diagnostics.find(
      (d) => d.code === "tsp-asyncapi/encoded-name-override-conflict",
    );
    expect(overrideDiagnostic).toBeDefined();
    // The message must describe *this* case (an override diverging from
    // its ancestor's wire name), not the unrelated-collision case.
    expect(String(overrideDiagnostic?.message)).toMatch(
      /overrides an inherited property but resolves to a different wire name/,
    );
  });

  it("should flatten (not allOf) a derived model whose new property's wire name collides with a different inherited property's wire name", async () => {
    const { builder, program, Derived } = await compileSchemas(t.code`
      model Base { a: string; }
      model ${t.model("Derived")} extends Base {
        @encodedName("application/json", "a")
        b: int32;
      }
    `);
    builder.buildSchema(Derived);

    const components = builder.getSchemas();
    // Must not be an unsatisfiable `allOf` requiring `a` to be both a
    // string (Base branch) and an integer (own branch) at once.
    expect(components.Derived).toEqual({
      type: "object",
      properties: { a: { type: "integer", format: "int32" } },
      required: ["a"],
    });
    const collisionDiagnostic = program.diagnostics.find(
      (d) => d.code === "tsp-asyncapi/encoded-name-override-conflict",
    );
    expect(collisionDiagnostic).toBeDefined();
    // The message must describe *this* case (an unrelated wire-name
    // collision), not the diverging-override case.
    expect(String(collisionDiagnostic?.message)).toMatch(
      /resolves to the same wire name .* as a different, unrelated inherited property/,
    );
  });

  it("should keep an inherited Record indexer's additionalProperties when the flatten fallback triggers", async () => {
    const { builder, Derived } = await compileSchemas(t.code`
      model Base extends Record<string> {
        @encodedName("application/json", "x")
        a: string;
      }
      model ${t.model("Derived")} extends Base {
        @encodedName("application/json", "y")
        a: string;
      }
    `);
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
    const { builder, program, Derived } = await compileSchemas(t.code`
      model Base { a: string; b: string; }
      model ${t.model("Derived")} extends Base { a: never; }
    `);
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
      program.diagnostics.some((d) => d.code === "tsp-asyncapi/never-typed-property-override"),
    ).toBe(true);
  });

  it("should report missing-discriminator-property when @discriminator is applied to a collection-backed model", async () => {
    const { builder, program, Names } = await compileSchemas(t.code`
      @discriminator("kind")
      model ${t.model("Names")} is string[];
    `);
    builder.buildSchema(Names);

    const components = builder.getSchemas();
    expect((components.Names as any).discriminator).toBeUndefined();
    expect(
      program.diagnostics.some((d) => d.code === "tsp-asyncapi/missing-discriminator-property"),
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
    const { builder, U } = await compileSchemas(t.code`
      model A { kind: "a"; }
      model B { kind: "b"; }
      @discriminated
      union ${t.union("U")} { a: A, b: B }
    `);
    builder.buildSchema(U);

    const components = builder.getSchemas();
    expect(components.U).toEqual({
      anyOf: [{ $ref: "#/components/schemas/A" }, { $ref: "#/components/schemas/B" }],
    });
  });
});
