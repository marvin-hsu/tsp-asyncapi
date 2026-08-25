import { describe, it, expect } from "vitest";
import { emitAvro } from "../../utils/avro.js";

/**
 * What the walk refuses, and what it writes when it refuses.
 *
 * It writes nothing. A refusal is an error, and an error stops every write, so
 * a compile either produces the schemas the author asked for or produces none.
 * A half translated record would still be a valid Avro schema, and a schema
 * registry would accept it, which is why nothing is guessed.
 *
 * Each case here is a construct this phase does not handle. Some of them,
 * marked below, arrive in a later phase. The rest have no Avro form at all.
 */

async function expectRefusal(source: string, code: string): Promise<void> {
  const result = await emitAvro(source);

  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(`tsp-avro/${code}`);
  expect(Object.keys(result.files)).toEqual([]);
}

describe("what the Avro walk refuses", () => {
  it("refuses a record with no Avro namespace above it", async () => {
    await expectRefusal(`@Avro.\`record\` model Event { id: string; }`, "namespace-required");
  });

  it("refuses an optional property, which needs a union with null", async () => {
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example.a")
      namespace A { @Avro.\`record\` model Event { id?: string; } }
      `,
      "unsupported-field",
    );
  });

  it("refuses a property default, which decides the order of a union", async () => {
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example.a")
      namespace A { @Avro.\`record\` model Event { id: string = "none"; } }
      `,
      "unsupported-field",
    );
  });

  it("refuses a union", async () => {
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example.a")
      namespace A { @Avro.\`record\` model Event { id: string | int32; } }
      `,
      "unsupported-type",
    );
  });

  it("refuses a scalar with no Avro form", async () => {
    // Avro has no unsigned integer, and widening `uint32` to `long` would
    // change what the author wrote.
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example.a")
      namespace A { @Avro.\`record\` model Event { count: uint32; } }
      `,
      "unsupported-type",
    );
  });

  it("refuses an anonymous model, because an Avro record needs a name", async () => {
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example.a")
      namespace A { @Avro.\`record\` model Event { at: { city: string; }; } }
      `,
      "unsupported-type",
    );
  });

  it("refuses a model that extends another, because the inherited fields would be lost", async () => {
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example.a")
      namespace A {
        model Base { id: string; }
        @Avro.\`record\` model Event extends Base { at: string; }
      }
      `,
      "unsupported-type",
    );
  });

  it("refuses an enum member that carries a value of its own", async () => {
    // An Avro enum holds symbols alone. The value has nowhere to go.
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example.a")
      namespace A {
        enum Currency { USD: "usd", EUR: "eur" }
        @Avro.\`record\` model Event { currency: Currency; }
      }
      `,
      "enum-member-value",
    );
  });

  it("refuses a namespace name that breaks the Avro rules", async () => {
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example-orders")
      namespace A { @Avro.\`record\` model Event { id: string; } }
      `,
      "invalid-name",
    );
  });

  it("refuses a field name that breaks the Avro rules", async () => {
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example.a")
      namespace A { @Avro.\`record\` model Event { \`order-id\`: string; } }
      `,
      "invalid-name",
    );
  });

  it("refuses an enum symbol that breaks the Avro rules", async () => {
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example.a")
      namespace A {
        enum Colour { \`off-white\` }
        @Avro.\`record\` model Event { colour: Colour; }
      }
      `,
      "invalid-name",
    );
  });

  it("refuses a model name that breaks the Avro rules", async () => {
    // TypeSpec allows a wider identifier than Avro does. A name in backticks
    // may hold anything at all, and Avro takes letters, digits and
    // underscores.
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example.a")
      namespace A { @Avro.\`record\` model \`Order-Placed\` { id: string; } }
      `,
      "invalid-name",
    );
  });

  it("refuses a template instance, because two instances share one name", async () => {
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example.a")
      namespace A {
        model Box<T> { value: T; }
        @Avro.\`record\` model Event { text: Box<string>; count: Box<int32>; }
      }
      `,
      "unsupported-type",
    );
  });

  it("refuses a model that holds an index signature", async () => {
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example.a")
      namespace A {
        model Bag { ...Record<string>; id: string; }
        @Avro.\`record\` model Event { bag: Bag; }
      }
      `,
      "unsupported-type",
    );
  });

  it("writes nothing at all when one record of two is refused", async () => {
    const result = await emitAvro(`
      @Avro.\`namespace\`("com.example.a")
      namespace A {
        @Avro.\`record\` model Good { id: string; }
        @Avro.\`record\` model Bad { id?: string; }
      }
    `);

    expect(Object.keys(result.files)).toEqual([]);
  });
});
