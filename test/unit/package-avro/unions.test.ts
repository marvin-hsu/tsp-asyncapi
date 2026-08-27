import { describe, it, expect } from "vitest";
import {
  emitAvroFiles,
  expectInstanceRoundTrip,
  fieldNamed,
  type RenderedField,
} from "../../utils/avro.js";

/**
 * Unions, which Avro spells as a JSON array and hedges with two rules.
 *
 * A union may not hold another union, and it may not name one type twice. Both
 * rules are about the reader: it tells the branches apart by type alone, so a
 * repeat is unreadable and a nested array has no place to say which branch it
 * is. Neither rule can be handed to the author, because TypeSpec allows both.
 *
 * So the walk flattens, and it refuses a repeat. Flattening always works. The
 * refusals live with the other refusals, next door.
 */

/**
 * Emits one record holding one property, and returns that field.
 *
 * @param source - The declarations and the property, written as TypeSpec
 * @returns The rendered field named `x`
 */
async function fieldOf(source: string): Promise<RenderedField> {
  const files = await emitAvroFiles(`
    @Avro.avroNamespace("com.example.unions")
    namespace Unions { ${source} }
  `);
  const schema = files["com/example/unions/Row.avsc"];
  expectInstanceRoundTrip(schema);
  return fieldNamed(schema, "x");
}

describe("how the Avro walk writes a union", () => {
  it("writes a union of primitives as a flat array", async () => {
    expect(
      (await fieldOf(`@Avro.avroRecord model Row { x: string | int32 | boolean; }`)).type,
    ).toEqual(["string", "int", "boolean"]);
  });

  it("flattens a union that holds another union", async () => {
    // TypeSpec lets a named union stand where a type stands, so a union can
    // reach a union. Avro has no such shape, and the branches are the same
    // branches, so they move up into the outer array.
    expect(
      (
        await fieldOf(`
          union Inner { a: int32, b: boolean }
          @Avro.avroRecord model Row { x: string | Inner; }
        `)
      ).type,
    ).toEqual(["string", "int", "boolean"]);
  });

  it("keeps the branches in the order the author wrote them", async () => {
    expect(
      (await fieldOf(`@Avro.avroRecord model Row { x: boolean | int32 | string; }`)).type,
    ).toEqual(["boolean", "int", "string"]);
  });

  it("writes a named type in full at its first branch and by name after", async () => {
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.unions")
      namespace Unions {
        model Address { street: string; }
        @Avro.avroRecord model Row {
          x: Address | string;
          y: Address | int32;
        }
      }
    `);
    const schema = files["com/example/unions/Row.avsc"];

    // The first occurrence rule does not stop at a union. Address is defined
    // inside the first union it appears in, and the second union refers to it.
    expect(fieldNamed(schema, "x").type).toMatchObject([
      { type: "record", name: "Address", namespace: "com.example.unions" },
      "string",
    ]);
    expect(fieldNamed(schema, "y").type).toEqual(["com.example.unions.Address", "int"]);
    expectInstanceRoundTrip(schema);
  });

  it("writes a union of an enum and a record", async () => {
    expect(
      (
        await fieldOf(`
          enum Colour { Red, Green }
          model Address { street: string; }
          @Avro.avroRecord model Row { x: Colour | Address; }
        `)
      ).type,
    ).toEqual([
      { type: "enum", name: "Colour", namespace: "com.example.unions", symbols: ["Red", "Green"] },
      {
        type: "record",
        name: "Address",
        namespace: "com.example.unions",
        fields: [{ name: "street", type: "string" }],
      },
    ]);
  });

  it("holds one array and one map in the same union", async () => {
    // Neither is a named type, and Avro allows one of each. Two arrays would
    // clash whatever they hold, which is what the refusal next door pins.
    expect(
      (await fieldOf(`@Avro.avroRecord model Row { x: string[] | Record<int32>; }`)).type,
    ).toEqual([
      { type: "array", items: "string" },
      { type: "map", values: "int" },
    ]);
  });

  it("writes a union of one branch as the branch itself", async () => {
    // Avro spells a union of one as the type, not as an array of one. A field
    // already folded it, and the items of an array did not, so `U[]` put a
    // union index on the wire that nothing needed.
    expect(
      (
        await fieldOf(`
          union U { a: string }
          @Avro.avroRecord model Row { x: U[]; }
        `)
      ).type,
    ).toEqual({ type: "array", items: "string" });
  });

  it("round-trips an instance of every branch through a buffer", async () => {
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.unions")
      namespace Unions {
        model Address { street: string; }
        @Avro.avroRecord model Row { x: Address | string | int32; }
      }
    `);

    // Twenty rounds, so every branch is reached. A single random instance
    // lands on one of the three and says nothing about the other two.
    expectInstanceRoundTrip(files["com/example/unions/Row.avsc"]);
  });
});
