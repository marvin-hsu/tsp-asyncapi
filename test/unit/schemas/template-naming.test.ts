/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect } from "vitest";
import { Model } from "@typespec/compiler";
import { AsyncAPITester } from "../../../src/testing/index.js";
import { t } from "@typespec/compiler/testing";
import { SchemaBuilder } from "../../../src/builders/schemas/builder.js";

describe("Unit: Schemas — template instantiation naming", () => {
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
    expect(Object.keys(builder2.getSchemas()).filter((k) => k.startsWith("Envelope"))).toHaveLength(
      1,
    );
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
});
