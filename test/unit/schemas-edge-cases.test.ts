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
