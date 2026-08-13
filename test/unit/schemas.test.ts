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
      const { TestModel, program } = await runner.compile(t.code`
        model ${t.model("TestModel")} {
          field: string;
        }
      `);

      const builder = new SchemaBuilder(program);
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
      const { TestScalars, program } = await runner.compile(t.code`
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
        }
      `);

      const builder = new SchemaBuilder(program);
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
    });

    it("should build schema for arrays and records", async () => {
      const runner = await AsyncAPITester.createInstance();
      const { TestCollections, program } = await runner.compile(t.code`
        model ${t.model("TestCollections")} {
          arr: string[];
          rec: Record<int32>;
        }
      `);

      const builder = new SchemaBuilder(program);
      builder.buildSchema(TestCollections);

      const props = builder.getSchemas().TestCollections.properties as Record<string, any>;
      expect(props.arr).toEqual({ type: "array", items: { type: "string" } });
      expect(props.rec).toEqual({
        type: "object",
        additionalProperties: { type: "integer", format: "int32" },
      });
    });

    it("should report diagnostic on duplicate schema names", async () => {
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

      const builder = new SchemaBuilder(program);
      builder.buildSchema(Type1 as Model);
      builder.buildSchema(Type2 as Model);

      const diagnostics = program.diagnostics;
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].code).toBe("typespec-asyncapi/duplicate-schema-name");
      expect(diagnostics[0].message).toBe(
        "Duplicate schema name 'Duplicate1'. Models from different namespaces have the same name.",
      );
    });
  });
});
