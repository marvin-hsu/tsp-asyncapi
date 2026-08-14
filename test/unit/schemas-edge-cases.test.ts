/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect } from "vitest";
import { AsyncAPITester } from "../../src/testing/index.js";
import { t } from "@typespec/compiler/testing";
import { SchemaBuilder } from "../../src/builders/schemas/builder.js";

describe("Unit: Schemas edge cases (regression)", () => {
  it("self-referential model does not blow the stack", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { Node } = await runner.compile(t.code`
      model ${t.model("Node")} {
        value: string;
        next?: Node;
      }
    `);
    const builder = new SchemaBuilder(runner.program);
    expect(() => builder.buildSchema(Node)).not.toThrow();
    const schema = builder.getSchemas().Node as any;
    expect(schema.properties.next).toEqual({ $ref: "#/components/schemas/Node" });
    expect(schema.required).toEqual(["value"]);
  });

  it("mutually referential models terminate", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { A } = await runner.compile(t.code`
      model ${t.model("A")} { b?: B; }
      model B { a?: A; }
    `);
    const builder = new SchemaBuilder(runner.program);
    expect(() => builder.buildSchema(A)).not.toThrow();
    expect(builder.getSchemas().A).toBeDefined();
    expect(builder.getSchemas().B).toBeDefined();
  });

  it("self-referential model via a union member does not blow the stack", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { Node } = await runner.compile(t.code`
      model Leaf {
        value: string;
      }
      model ${t.model("Node")} {
        children: Node | Leaf;
      }
    `);
    const builder = new SchemaBuilder(runner.program);
    // The same `building` guard that protects a direct self-reference
    // (`next?: Node` above) must also protect an indirect one reached
    // through a union variant, since a union variant is itself just
    // another `buildSchema` call.
    expect(() => builder.buildSchema(Node)).not.toThrow();
    const schema = builder.getSchemas().Node as any;
    expect(schema.properties.children).toEqual({
      anyOf: [{ $ref: "#/components/schemas/Node" }, { $ref: "#/components/schemas/Leaf" }],
    });
  });

  it("reports unsupported-payload-type and returns an empty schema for a Type.kind this emitter does not handle", async () => {
    // `Type.kind` has many more variants than `SchemaBuilder.buildSchema`
    // handles. TypeScript's exhaustiveness check cannot catch a missing
    // case, since the `Type` union is deliberately open-ended.
    // The TypeSpec compiler itself legally accepts an `Interface` named
    // where a property's type is expected; only this emitter rejects it.
    // This exercises the real `default` branch of `buildSchema`'s switch,
    // rather than a synthetic `Type.kind`.
    const runner = await AsyncAPITester.createInstance();
    const { M } = await runner.compile(t.code`
      interface Iface {}
      model ${t.model("M")} {
        field: Iface;
      }
    `);
    const builder = new SchemaBuilder(runner.program);
    builder.buildSchema(M);
    const fieldSchema = (builder.getSchemas().M as any).properties.field;

    expect(fieldSchema).toEqual({});
    const diagnostic = runner.program.diagnostics.find(
      (d) => d.code === "typespec-asyncapi/unsupported-payload-type",
    );
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.severity).toBe("error");
    expect(diagnostic?.message).toContain("Interface");
  });

  it("reports unrepresentable-circular-reference instead of crashing for a self-referencing anonymous model", async () => {
    // `alias` only expands its right-hand side. It builds a self-referencing
    // anonymous `Model` with no named declaration in between, unlike a
    // circular reference through a named model (see the tests above).
    // `buildModelSchema`'s anonymous branch used to skip the `building`
    // guard entirely, so this used to throw
    // "RangeError: Maximum call stack size exceeded" instead of reporting a
    // diagnostic.
    const runner = await AsyncAPITester.createInstance();
    const { M } = await runner.compile(t.code`
      alias Recursive = { a: Recursive };
      model ${t.model("M")} {
        field: Recursive;
      }
    `);
    const builder = new SchemaBuilder(runner.program);
    expect(() => builder.buildSchema(M)).not.toThrow();
    const fieldSchema = (builder.getSchemas().M as any).properties.field;
    expect(fieldSchema.type).toBe("object");
    expect(fieldSchema.properties.a).toEqual({});
    const diagnostic = runner.program.diagnostics.find(
      (d) => d.code === "typespec-asyncapi/unrepresentable-circular-reference",
    );
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.severity).toBe("error");
  });

  it("anonymous model keeps its properties", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { Outer } = await runner.compile(t.code`
      model ${t.model("Outer")} {
        inline: { x: string; y?: int32 };
      }
    `);
    const builder = new SchemaBuilder(runner.program);
    builder.buildSchema(Outer);
    const props = builder.getSchemas().Outer.properties as Record<string, any>;
    expect(props.inline.type).toBe("object");
    expect(props.inline.properties.x).toEqual({ type: "string" });
    expect(props.inline.required).toEqual(["x"]);
  });
});
