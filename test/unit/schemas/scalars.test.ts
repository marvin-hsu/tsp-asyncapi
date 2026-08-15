/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect } from "vitest";
import { compileSchemas } from "../../utils/schema-host.js";
import { t } from "@typespec/compiler/testing";

describe("Unit: Schemas — scalars", () => {
  it("should build string scalar schema", async () => {
    const { builder, TestModel } = await compileSchemas(t.code`
      model ${t.model("TestModel")} {
        field: string;
      }
    `);
    const schema = builder.buildSchema(TestModel) as any;

    expect(schema.$ref).toBe("#/components/schemas/TestModel");

    const components = builder.getSchemas();
    expect(components.TestModel).toBeDefined();
    expect(components.TestModel.type).toBe("object");
    expect(components.TestModel.properties?.field).toEqual({ type: "string" });
    expect(components.TestModel.required).toEqual(["field"]);
  });

  it("should build schema for various scalars", async () => {
    const { builder, TestScalars } = await compileSchemas(t.code`
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
    const { builder, M } = await compileSchemas(t.code`
      scalar Email extends string;
      scalar Age extends int32;
      scalar Opaque;
      model ${t.model("M")} {
        e: Email;
        a: Age;
        o: Opaque;
      }
    `);
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
    const { builder, M } = await compileSchemas(t.code`
      namespace MyLib {
        scalar duration extends int32;
        scalar url extends int64;
      }
      model ${t.model("M")} {
        d: MyLib.duration;
        u: MyLib.url;
      }
    `);
    builder.buildSchema(M);

    const props = builder.getSchemas().M.properties as Record<string, any>;
    // These names collide with built-in `duration`/`url`, but these are
    // user-declared scalars in `MyLib`, not the TypeSpec built-ins. They
    // must resolve via their own baseScalar chain, not the lookup table.
    expect(props.d).toEqual({ type: "integer", format: "int32" });
    expect(props.u).toEqual({ type: "integer", format: "int64" });
  });

  it("falls back to the unconstrained schema for a scalar derived from a built-in that has no dedicated table entry", async () => {
    // `unixTimestamp32` is a real TypeSpec standard-library scalar (it
    // extends `utcDateTime`), but `SCALAR_SCHEMAS` carries no entry for
    // it. A built-in scalar is always looked up by its own name; it never
    // falls through to its `baseScalar`'s mapping. So a user scalar
    // derived from it bottoms out at the unconstrained `{}` shape, the
    // same as a user scalar derived from no built-in at all.
    const { builder, M } = await compileSchemas(t.code`
      scalar Foo extends unixTimestamp32;
      model ${t.model("M")} {
        a: Foo;
      }
    `);
    builder.buildSchema(M);

    const props = builder.getSchemas().M.properties as Record<string, any>;
    expect(props.a).toEqual({});
  });
});
