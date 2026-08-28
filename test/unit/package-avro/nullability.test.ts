import { describe, it, expect } from "vitest";
import {
  acceptSchema,
  emitAvro,
  emitAvroFiles,
  expectInstanceRoundTrip,
  fieldNamed,
  recordFields,
  type RenderedField,
} from "../../utils/avro.js";

/**
 * Optionality and defaults, which Avro settles with one rule.
 *
 * Avro has no optional field and no nullable type. A field that may be absent
 * is a union with null, and a union carries a default only if the default
 * matches its first branch. So an optional property and a property default are
 * one decision, not two, and the order of the branches is the answer.
 *
 * The four rows below are that answer. The last row reverses the order on
 * purpose: the author wrote a default that is not null, so null cannot lead.
 * Each row is a test of its own, because a row that silently took the shape of
 * its neighbour would still be legal Avro and would still round trip.
 *
 * TypeSpec says all four in the language. There is no `@default` decorator
 * here, and there is no `@optional`: `?` and `= value` already exist.
 */

/**
 * Emits one record holding one property, and returns that field.
 *
 * @param property - The property, written as TypeSpec source
 * @returns The rendered field
 */
async function fieldOf(property: string): Promise<RenderedField> {
  const files = await emitAvroFiles(`
    @Avro.avroNamespace("com.example.rows")
    namespace Rows {
      @Avro.avroRecord model Row { ${property} }
    }
  `);
  const schema = files["com/example/rows/Row.avsc"];
  expectInstanceRoundTrip(schema);
  return fieldNamed(schema, "x");
}

describe("how a field carries null and a default", () => {
  it("writes a required property as the bare type", async () => {
    expect(await fieldOf(`x: string;`)).toEqual({ name: "x", type: "string" });
  });

  it("writes an optional property as a union with null first, defaulting to null", async () => {
    expect(await fieldOf(`x?: string;`)).toEqual({
      name: "x",
      type: ["null", "string"],
      default: null,
    });
  });

  it("writes a required property with a default as the bare type and that default", async () => {
    expect(await fieldOf(`x: string = "a";`)).toEqual({
      name: "x",
      type: "string",
      default: "a",
    });
  });

  it("writes an optional property with a default as a union with null last", async () => {
    // The reversed order is the point. Avro reads the default against the
    // first branch of the union, so "a" and null cannot both lead, and the
    // author wrote "a".
    expect(await fieldOf(`x?: string = "a";`)).toEqual({
      name: "x",
      type: ["string", "null"],
      default: "a",
    });
  });

  it("keeps the branches of a union the author wrote, and adds no default", async () => {
    // `T | null` is the ordinary way to spell a nullable field. Nobody asked
    // for a default, so none is written: Avro wants one where a reader has to
    // fill the field in, and this field is always present.
    //
    // With no default, nothing makes one branch have to lead, so the author's
    // order stands. The position of a branch is its index on the wire, so
    // moving null here would change what the schema means.
    expect(await fieldOf(`x: string | null;`)).toEqual({
      name: "x",
      type: ["string", "null"],
    });
  });

  it("adds no second null when the author already wrote one", async () => {
    // A union names each type once, so the null the `?` asks for is the null
    // that is already there.
    expect(await fieldOf(`x?: string | null;`)).toEqual({
      name: "x",
      type: ["null", "string"],
      default: null,
    });
  });

  it("keeps null last when a union has a default that is not null", async () => {
    expect(await fieldOf(`x?: int32 | string = 3;`)).toEqual({
      name: "x",
      type: ["int", "string", "null"],
      default: 3,
    });
  });

  it("carries a default of every kind a supported type can hold", async () => {
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.defaults")
      namespace Defaults {
        enum Colour { Red, Green }
        @Avro.avroRecord model Row {
          flag: boolean = false;
          count: int32 = 3;
          ratio: float64 = 1.5;
          text: string = "a";
          colour: Colour = Colour.Red;
        }
      }
    `);
    const schema = files["com/example/defaults/Row.avsc"];

    expect(recordFields(schema).map((field) => [field.name, field.default])).toEqual([
      ["flag", false],
      ["count", 3],
      ["ratio", 1.5],
      ["text", "a"],
      ["colour", "Red"],
    ]);
    expectInstanceRoundTrip(schema);
  });

  it("writes the default after the type, whichever field it belongs to", async () => {
    // The key order is what makes two runs of the emitter write one set of
    // bytes. `default` is last, which is the order the Avro specification
    // lists the members of a field in.
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.rows")
      namespace Rows {
        @Avro.avroRecord model Row {
          /** Why it is here. */
          x?: string;
        }
      }
    `);
    const field = fieldNamed(files["com/example/rows/Row.avsc"], "x");

    expect(Object.keys(field)).toEqual(["name", "type", "doc", "default"]);
  });

  it("lets avsc read the default back out of the schema", async () => {
    // The layer above pins the bytes. This one asks the reference
    // implementation what the schema means: a record written with no `x` at
    // all comes back holding the default.
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.rows")
      namespace Rows {
        @Avro.avroRecord model Row { x?: string = "a"; }
      }
    `);
    const type = acceptSchema(files["com/example/rows/Row.avsc"]);

    expect(type.fromBuffer(type.toBuffer({ x: "b" }))).toEqual({ x: "b" });
    expect(type.fromBuffer(type.toBuffer({ x: null }))).toEqual({ x: null });
  });

  it("puts the branch the default belongs to first, wherever the author wrote it", async () => {
    // The author wrote `string` first and a default of 3. Avro reads a default
    // against the first branch alone, so `int` has to lead. The order the
    // author wrote is not a promise the emitter can keep here.
    expect(await fieldOf(`x?: string | int32 = 3;`)).toEqual({
      name: "x",
      type: ["int", "string", "null"],
      default: 3,
    });
  });

  it("puts that branch first in a required union too", async () => {
    expect(await fieldOf(`x: string | int32 = 3;`)).toEqual({
      name: "x",
      type: ["int", "string"],
      default: 3,
    });
  });

  it("puts an enum branch first when the default is one of its symbols", async () => {
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.rows")
      namespace Rows {
        enum Colour { Red, Green }
        @Avro.avroRecord model Row { x?: string | Colour = Colour.Red; }
      }
    `);
    const field = fieldNamed(files["com/example/rows/Row.avsc"], "x");

    expect(field.default).toBe("Red");
    expect((field.type as { name?: string }[])[0].name).toBe("Colour");
  });

  it("carries a record default on an optional field", async () => {
    // The value names no branch of its own, and `["null", Inner]` leaves one
    // place for it to sit. This is how every optional record field is
    // written, and refusing it refused the ordinary case.
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.rows")
      namespace Rows {
        model Inner { a: string; }
        @Avro.avroRecord model Row { x?: Inner = #{ a: "z" }; }
      }
    `);

    const field = fieldNamed(files["com/example/rows/Row.avsc"], "x");
    expect(field.default).toEqual({ a: "z" });
    expect((field.type as [{ name?: string }, string])[0].name).toBe("Inner");
    expect((field.type as [unknown, string])[1]).toBe("null");
  });

  it("carries a record default on a union that names null itself", async () => {
    // `Inner | null` is the same union the `?` builds. The compiler writes a
    // value against the type it is handed. The union is not that type, and
    // handing it over wrote `{}`, which satisfies no branch.
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.rows")
      namespace Rows {
        model Inner { a: string; }
        @Avro.avroRecord model Row { x?: Inner | null = #{ a: "z" }; }
      }
    `);

    expect(fieldNamed(files["com/example/rows/Row.avsc"], "x").default).toEqual({ a: "z" });
  });

  it("carries an array default on a union that names null itself", async () => {
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.rows")
      namespace Rows {
        @Avro.avroRecord model Row { x?: string[] | null = #["z"]; }
      }
    `);

    expect(fieldNamed(files["com/example/rows/Row.avsc"], "x").default).toEqual(["z"]);
  });

  it("carries an array default on an optional field", async () => {
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.rows")
      namespace Rows {
        @Avro.avroRecord model Row { x?: string[] = #["z"]; }
      }
    `);

    expect(fieldNamed(files["com/example/rows/Row.avsc"], "x")).toEqual({
      name: "x",
      type: [{ type: "array", items: "string" }, "null"],
      default: ["z"],
    });
  });

  it("refuses a default that names no one branch of the union", async () => {
    // A model literal in a union says nothing about which record it is, so
    // the branch that has to lead cannot be named. Writing the field anyway
    // would put the default against whichever branch came first.
    const result = await emitAvro(`
      @Avro.avroNamespace("com.example.rows")
      namespace Rows {
        model Inner { a: string; }
        @Avro.avroRecord model Row { x?: Inner | int32 = #{ a: "z" }; }
      }
    `);

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "tsp-avro/invalid-default",
    ]);
    expect(Object.keys(result.files)).toEqual([]);
  });

  it("refuses a default the compiler cannot write out as JSON", async () => {
    // 9007199254740993 is one past what a double holds. The compiler answers
    // null for it, and null is a legal Avro default, so an emitter that took
    // the answer would quietly write a field the author never asked for.
    const result = await emitAvro(`
      @Avro.avroNamespace("com.example.rows")
      namespace Rows {
        @Avro.avroRecord model Row { x?: int64 = 9007199254740993; }
      }
    `);

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "tsp-avro/invalid-default",
    ]);
    expect(Object.keys(result.files)).toEqual([]);
  });
});
