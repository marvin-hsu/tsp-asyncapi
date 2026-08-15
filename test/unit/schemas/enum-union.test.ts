/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect } from "vitest";
import { AsyncAPITester } from "../../../src/testing/index.js";
import { t } from "@typespec/compiler/testing";
import { SchemaBuilder } from "../../../src/builders/schemas/builder.js";

describe("Unit: Schemas — enums and unions", () => {
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
