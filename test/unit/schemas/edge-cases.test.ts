/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect } from "vitest";
import { compileSchemas } from "../../utils/schema-host.js";
import { t } from "@typespec/compiler/testing";

describe("Unit: Schemas edge cases (regression)", () => {
  it("self-referential model does not blow the stack", async () => {
    const { builder, Node } = await compileSchemas(t.code`
      model ${t.model("Node")} {
        value: string;
        next?: Node;
      }
    `);
    expect(() => builder.buildSchema(Node)).not.toThrow();
    const schema = builder.getSchemas().Node as any;
    expect(schema.properties.next).toEqual({ $ref: "#/components/schemas/Node" });
    expect(schema.required).toEqual(["value"]);
  });

  it("mutually referential models terminate", async () => {
    const { builder, A } = await compileSchemas(t.code`
      model ${t.model("A")} { b?: B; }
      model B { a?: A; }
    `);
    expect(() => builder.buildSchema(A)).not.toThrow();
    expect(builder.getSchemas().A).toBeDefined();
    expect(builder.getSchemas().B).toBeDefined();
  });

  it("self-referential model via a union member does not blow the stack", async () => {
    const { builder, Node } = await compileSchemas(t.code`
      model Leaf {
        value: string;
      }
      model ${t.model("Node")} {
        children: Node | Leaf;
      }
    `);
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
    const { builder, program, M } = await compileSchemas(t.code`
      interface Iface {}
      model ${t.model("M")} {
        field: Iface;
      }
    `);
    builder.buildSchema(M);
    const fieldSchema = (builder.getSchemas().M as any).properties.field;

    expect(fieldSchema).toEqual({});
    const diagnostic = program.diagnostics.find(
      (d) => d.code === "tsp-asyncapi/unsupported-payload-type",
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
    const { builder, program, M } = await compileSchemas(t.code`
      alias Recursive = { a: Recursive };
      model ${t.model("M")} {
        field: Recursive;
      }
    `);
    expect(() => builder.buildSchema(M)).not.toThrow();
    const fieldSchema = (builder.getSchemas().M as any).properties.field;
    expect(fieldSchema.type).toBe("object");
    expect(fieldSchema.properties.a).toEqual({});
    const diagnostic = program.diagnostics.find(
      (d) => d.code === "tsp-asyncapi/unrepresentable-circular-reference",
    );
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.severity).toBe("error");
  });

  it("registers a built-in model of the TypeSpec namespace that is neither an array nor a record", async () => {
    // The early inline path asks two questions. First, does the model come
    // from the TypeSpec namespace? Second, does it have a collection shape?
    // `TypeSpec.ServiceOptions` answers yes and then no. So the build falls
    // through to the named-declaration path and registers a component.
    // Every other model of that namespace this suite reaches is an `Array`
    // or a `Record` instantiation, which returns a shape and stops there.
    const { builder, M } = await compileSchemas(t.code`
      model ${t.model("M")} {
        options: TypeSpec.ServiceOptions;
      }
    `);
    builder.buildSchema(M);

    const props = builder.getSchemas().M.properties as Record<string, any>;
    expect(props.options.$ref).toBe("#/components/schemas/ServiceOptions");
    expect(builder.getSchemas().ServiceOptions).toBeDefined();
  });

  it("anonymous model keeps its properties", async () => {
    const { builder, Outer } = await compileSchemas(t.code`
      model ${t.model("Outer")} {
        inline: { x: string; y?: int32 };
      }
    `);
    builder.buildSchema(Outer);
    const props = builder.getSchemas().Outer.properties as Record<string, any>;
    expect(props.inline.type).toBe("object");
    expect(props.inline.properties.x).toEqual({ type: "string" });
    expect(props.inline.required).toEqual(["x"]);
  });
});
