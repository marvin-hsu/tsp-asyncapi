import { describe, it, expect } from "vitest";
import { compileSchemas } from "../../../utils/schema-host.js";
import { t } from "@typespec/compiler/testing";
import { findDiagnostic } from "../../../utils/diagnostics.js";
import { propertiesOf, schemaOf } from "../../../utils/document.js";

describe("Unit: Schemas edge cases (regression)", () => {
  it("self-referential model does not blow the stack", async () => {
    const { builder, Node } = await compileSchemas(t.code`
      model ${t.model("Node")} {
        value: string;
        next?: Node;
      }
    `);
    expect(() => builder.buildSchema(Node)).not.toThrow();
    const schema = builder.getSchemas().Node;
    expect(propertiesOf(schema).next).toEqual({ $ref: "#/components/schemas/Node" });
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
    // The `building` guard that protects a direct self-reference (`next?: Node`
    // above) must also protect an indirect one reached through a union variant.
    // A union variant is itself just another `buildSchema` call.
    expect(() => builder.buildSchema(Node)).not.toThrow();
    const schema = builder.getSchemas().Node;
    expect(propertiesOf(schema).children).toEqual({
      anyOf: [{ $ref: "#/components/schemas/Node" }, { $ref: "#/components/schemas/Leaf" }],
    });
  });

  it("reports unsupported-payload-type and returns an empty schema for a Type.kind this emitter does not handle", async () => {
    // `Type.kind` has more variants than `SchemaBuilder.buildSchema` handles.
    // The `Type` union is deliberately open-ended, so TypeScript's
    // exhaustiveness check cannot catch a missing case.
    // The TypeSpec compiler legally accepts an `Interface` where a property's
    // type is expected. Only this emitter rejects it, through the real
    // `default` branch of `buildSchema`'s switch.
    const { builder, program, M } = await compileSchemas(t.code`
      interface Iface {}
      model ${t.model("M")} {
        field: Iface;
      }
    `);
    builder.buildSchema(M);
    const fieldSchema = schemaOf(propertiesOf(builder.getSchemas().M).field);

    expect(fieldSchema).toEqual({});
    const diagnostic = findDiagnostic(program.diagnostics, "unsupported-payload-type");
    expect(diagnostic.severity).toBe("error");
    expect(diagnostic.message).toContain("Interface");
  });

  it("reports unrepresentable-circular-reference instead of crashing for a self-referencing anonymous model", async () => {
    // `alias` only expands its right-hand side. It builds a self-referencing
    // anonymous `Model` with no named declaration in between, unlike a
    // circular reference through a named model (see the tests above).
    // The `building` guard must cover this anonymous branch too, or the
    // build overflows the call stack instead of reporting a diagnostic.
    const { builder, program, M } = await compileSchemas(t.code`
      alias Recursive = { a: Recursive };
      model ${t.model("M")} {
        field: Recursive;
      }
    `);
    expect(() => builder.buildSchema(M)).not.toThrow();
    const fieldSchema = schemaOf(propertiesOf(builder.getSchemas().M).field);
    expect(fieldSchema.type).toBe("object");
    expect(propertiesOf(fieldSchema).a).toEqual({});
    const diagnostic = findDiagnostic(program.diagnostics, "unrepresentable-circular-reference");
    expect(diagnostic.severity).toBe("error");
  });

  it("registers a built-in model of the TypeSpec namespace that is neither an array nor a record", async () => {
    // The early inline path checks two things: is the model from the
    // TypeSpec namespace, and does it have a collection shape (`Array` or
    // `Record`)? `TypeSpec.ServiceOptions` satisfies only the first check.
    // The build falls through to the named-declaration path and registers
    // a component.
    const { builder, M } = await compileSchemas(t.code`
      model ${t.model("M")} {
        options: TypeSpec.ServiceOptions;
      }
    `);
    builder.buildSchema(M);

    const props = propertiesOf(builder.getSchemas().M);
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
    const props = propertiesOf(builder.getSchemas().Outer);
    expect(schemaOf(props.inline).type).toBe("object");
    expect(propertiesOf(schemaOf(props.inline)).x).toEqual({ type: "string" });
    expect(schemaOf(props.inline).required).toEqual(["x"]);
  });
});
