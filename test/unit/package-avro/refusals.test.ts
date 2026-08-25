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
 * Each case here is a construct with no Avro form, or one Avro forbids.
 */

/**
 * Asserts that a source is refused, and that it is refused for the stated
 * reasons.
 *
 * The whole rendered message is compared, not the diagnostic code. Eight of
 * the cases below share two codes, so a code alone cannot tell one refusal
 * from another, and a test would pass on a refusal it was not written for.
 * The list is compared for equality, so a refusal nobody expected fails the
 * test as well.
 *
 * @param source - The TypeSpec source
 * @param refusals - Every expected diagnostic, as `code: message`, in order
 */
async function expectRefusal(source: string, ...refusals: string[]): Promise<void> {
  const result = await emitAvro(source);

  expect(
    result.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`),
  ).toEqual(refusals.map((refusal) => `tsp-avro/${refusal}`));
  expect(Object.keys(result.files)).toEqual([]);
}

describe("what the Avro walk refuses", () => {
  it("refuses a record with no Avro namespace above it", async () => {
    await expectRefusal(
      `@Avro.\`record\` model Event { id: string; }`,
      `namespace-required: A record needs an Avro namespace. Apply @namespace to this model's namespace, or to one above it.`,
    );
  });

  it("refuses a union that names one primitive twice", async () => {
    // TypeSpec keeps the two branches apart, and Avro cannot: a reader picks
    // a branch by its type, so the second string is unreachable.
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example.a")
      namespace A {
        union Inner { a: string, b: int32 }
        @Avro.\`record\` model Event { id: string | Inner; }
      }
      `,
      `duplicate-union-branch: Two branches of this union are both the Avro type "string". An Avro union holds each type once.`,
    );
  });

  it("refuses a union that names one record twice", async () => {
    // A named type is compared by its full name, which is the name Avro
    // knows it by.
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example.a")
      namespace A {
        model Address { street: string; }
        @Avro.\`record\` model Event { at: Address | Address; }
      }
      `,
      `duplicate-union-branch: Two branches of this union are both the Avro type "com.example.a.Address". An Avro union holds each type once.`,
    );
  });

  it("refuses a union of two arrays, whatever they hold", async () => {
    // An array carries no name, so Avro has nothing to tell two of them
    // apart by. The rule is the type, not the item type.
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example.a")
      namespace A { @Avro.\`record\` model Event { id: string[] | int32[]; } }
      `,
      `duplicate-union-branch: Two branches of this union are both the Avro type "array". An Avro union holds each type once.`,
    );
  });

  it("refuses a type the language names but Avro cannot hold", async () => {
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example.a")
      namespace A { @Avro.\`record\` model Event { id: unknown; } }
      `,
      `unsupported-type: The type "unknown" has no Avro form.`,
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
      `unsupported-type: The scalar "uint32" has no Avro form.`,
    );
  });

  it("refuses an anonymous model, because an Avro record needs a name", async () => {
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example.a")
      namespace A { @Avro.\`record\` model Event { at: { city: string; }; } }
      `,
      `unsupported-type: An anonymous model has no name, and an Avro record needs one.`,
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
      `unsupported-type: The model "Event" extends another model. An Avro record holds no inheritance, and the inherited fields would be lost.`,
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
      `enum-member-value: The enum member "USD" carries a value of its own. An Avro enum holds symbols alone, so the value would be lost.`,
      `enum-member-value: The enum member "EUR" carries a value of its own. An Avro enum holds symbols alone, so the value would be lost.`,
    );
  });

  it("refuses a namespace name that breaks the Avro rules", async () => {
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example-orders")
      namespace A { @Avro.\`record\` model Event { id: string; } }
      `,
      `invalid-name: "com.example-orders" is not a legal Avro namespace. A namespace is one or more legal Avro names, joined by dots.`,
      `namespace-required: A record needs an Avro namespace. Apply @namespace to this model's namespace, or to one above it.`,
    );
  });

  it("refuses a field name that breaks the Avro rules", async () => {
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example.a")
      namespace A { @Avro.\`record\` model Event { \`order-id\`: string; } }
      `,
      `invalid-name: "order-id" is not a legal Avro name. A name starts with a letter or an underscore, and continues with letters, digits or underscores.`,
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
      `invalid-name: "off-white" is not a legal Avro name. A name starts with a letter or an underscore, and continues with letters, digits or underscores.`,
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
      `invalid-name: "Order-Placed" is not a legal Avro name. A name starts with a letter or an underscore, and continues with letters, digits or underscores.`,
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
      `unsupported-type: The model "Box" is a template instance. Two instances of one template share a name, and an Avro schema names each type once.`,
      `unsupported-type: The model "Box" is a template instance. Two instances of one template share a name, and an Avro schema names each type once.`,
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
      `unsupported-type: The model "Bag" holds an index signature. An Avro record has fields alone, so the indexed values would be lost.`,
    );
  });

  it("refuses two declarations that take one Avro name", async () => {
    // Two TypeSpec namespaces may carry one Avro namespace, so two models
    // named Address can take one full name with no template in sight. Writing
    // the second as a reference would give it the fields of the first.
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example.x")
      namespace A { model Address { street: string; } }
      @Avro.\`namespace\`("com.example.x")
      namespace B { model Address { zip: int32; } }
      @Avro.\`namespace\`("com.example.x")
      namespace C {
        @Avro.\`record\` model Event { a: A.Address; b: B.Address; }
      }
      `,
      `unsupported-type: "B.Address" and "A.Address" both take the Avro name "com.example.x.Address". An Avro schema names each type once, so the second would read as the first.`,
    );
  });

  it("refuses two records that write to one file", async () => {
    await expectRefusal(
      `
      @Avro.\`namespace\`("com.example.y")
      namespace A { @Avro.\`record\` model Event { street: string; } }
      @Avro.\`namespace\`("com.example.y")
      namespace B { @Avro.\`record\` model Event { zip: int32; } }
      `,
      `duplicate-record: "B.Event" and "A.Event" both write to "/out/com/example/y/Event.avsc". One file holds one schema, so the second would replace the first.`,
    );
  });

  it("writes nothing at all when one record of two is refused", async () => {
    const result = await emitAvro(`
      @Avro.\`namespace\`("com.example.a")
      namespace A {
        @Avro.\`record\` model Good { id: string; }
        @Avro.\`record\` model Bad { id: uint32; }
      }
    `);

    expect(Object.keys(result.files)).toEqual([]);
  });
});
