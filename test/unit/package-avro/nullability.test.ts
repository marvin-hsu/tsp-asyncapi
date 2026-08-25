import { describe, it, expect } from "vitest";
import {
  acceptSchema,
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
    @Avro.\`namespace\`("com.example.rows")
    namespace Rows {
      @Avro.\`record\` model Row { ${property} }
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

  it("puts null first in a union the author wrote, and adds no default", async () => {
    // `T | null` is the ordinary way to spell a nullable field. Nobody asked
    // for a default, so none is written: Avro wants one where a reader has to
    // fill the field in, and this field is always present.
    expect(await fieldOf(`x: string | null;`)).toEqual({
      name: "x",
      type: ["null", "string"],
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
      @Avro.\`namespace\`("com.example.defaults")
      namespace Defaults {
        enum Colour { Red, Green }
        @Avro.\`record\` model Row {
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
      @Avro.\`namespace\`("com.example.rows")
      namespace Rows {
        @Avro.\`record\` model Row {
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
      @Avro.\`namespace\`("com.example.rows")
      namespace Rows {
        @Avro.\`record\` model Row { x?: string = "a"; }
      }
    `);
    const type = acceptSchema(files["com/example/rows/Row.avsc"]);

    expect(type.fromBuffer(type.toBuffer({ x: "b" }))).toEqual({ x: "b" });
    expect(type.fromBuffer(type.toBuffer({ x: null }))).toEqual({ x: null });
  });
});
