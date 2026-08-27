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
      `@Avro.avroRecord model Event { id: string; }`,
      `namespace-required: A record needs an Avro namespace. Apply @namespace to this model's namespace, or to one above it.`,
    );
  });

  it("refuses a union that names one primitive twice", async () => {
    // TypeSpec keeps the two branches apart, and Avro cannot: a reader picks
    // a branch by its type, so the second string is unreachable.
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        union Inner { a: string, b: int32 }
        @Avro.avroRecord model Event { id: string | Inner; }
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
      @Avro.avroNamespace("com.example.a")
      namespace A {
        model Address { street: string; }
        @Avro.avroRecord model Event { at: Address | Address; }
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
      @Avro.avroNamespace("com.example.a")
      namespace A { @Avro.avroRecord model Event { id: string[] | int32[]; } }
      `,
      `duplicate-union-branch: Two branches of this union are both the Avro type "array". An Avro union holds each type once.`,
    );
  });

  it("refuses a type the language names but Avro cannot hold", async () => {
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A { @Avro.avroRecord model Event { id: unknown; } }
      `,
      `unsupported-type: The type "unknown" has no Avro form.`,
    );
  });

  it("refuses a scalar with no Avro form", async () => {
    // Avro has no unsigned integer, and widening `uint32` to `long` would
    // change what the author wrote.
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A { @Avro.avroRecord model Event { count: uint32; } }
      `,
      `unsupported-type: The scalar "uint32" has no Avro form.`,
    );
  });

  it("refuses an anonymous model, because an Avro record needs a name", async () => {
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A { @Avro.avroRecord model Event { at: { city: string; }; } }
      `,
      `unsupported-type: An anonymous model has no name, and an Avro record needs one.`,
    );
  });

  it("refuses a model that extends another, because the inherited fields would be lost", async () => {
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        model Base { id: string; }
        @Avro.avroRecord model Event extends Base { at: string; }
      }
      `,
      `unsupported-type: The model "Event" extends another model. An Avro record holds no inheritance, and the inherited fields would be lost.`,
    );
  });

  it("refuses an enum member that carries a value of its own", async () => {
    // An Avro enum holds symbols alone. The value has nowhere to go.
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        enum Currency { USD: "usd", EUR: "eur" }
        @Avro.avroRecord model Event { currency: Currency; }
      }
      `,
      `enum-member-value: The enum member "USD" carries a value of its own. An Avro enum holds symbols alone, so the value would be lost.`,
      `enum-member-value: The enum member "EUR" carries a value of its own. An Avro enum holds symbols alone, so the value would be lost.`,
    );
  });

  it("refuses a namespace name that breaks the Avro rules", async () => {
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example-orders")
      namespace A { @Avro.avroRecord model Event { id: string; } }
      `,
      `invalid-name: "com.example-orders" is not a legal Avro namespace. A namespace is one or more legal Avro names, joined by dots.`,
      `namespace-required: A record needs an Avro namespace. Apply @namespace to this model's namespace, or to one above it.`,
    );
  });

  it("refuses a field name that breaks the Avro rules", async () => {
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A { @Avro.avroRecord model Event { \`order-id\`: string; } }
      `,
      `invalid-name: "order-id" is not a legal Avro name. A name starts with a letter or an underscore, and continues with letters, digits or underscores.`,
    );
  });

  it("refuses an enum symbol that breaks the Avro rules", async () => {
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        enum Colour { \`off-white\` }
        @Avro.avroRecord model Event { colour: Colour; }
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
      @Avro.avroNamespace("com.example.a")
      namespace A { @Avro.avroRecord model \`Order-Placed\` { id: string; } }
      `,
      `invalid-name: "Order-Placed" is not a legal Avro name. A name starts with a letter or an underscore, and continues with letters, digits or underscores.`,
    );
  });

  it("refuses a template instance, because two instances share one name", async () => {
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        model Box<T> { value: T; }
        @Avro.avroRecord model Event { text: Box<string>; count: Box<int32>; }
      }
      `,
      `unsupported-type: The model "Box" is a template instance. Two instances of one template share a name, and an Avro schema names each type once.`,
      `unsupported-type: The model "Box" is a template instance. Two instances of one template share a name, and an Avro schema names each type once.`,
    );
  });

  it("refuses a model that holds an index signature", async () => {
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        model Bag { ...Record<string>; id: string; }
        @Avro.avroRecord model Event { bag: Bag; }
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
      @Avro.avroNamespace("com.example.x")
      namespace A { model Address { street: string; } }
      @Avro.avroNamespace("com.example.x")
      namespace B { model Address { zip: int32; } }
      @Avro.avroNamespace("com.example.x")
      namespace C {
        @Avro.avroRecord model Event { a: A.Address; b: B.Address; }
      }
      `,
      `unsupported-type: "B.Address" and "A.Address" both take the Avro name "com.example.x.Address". An Avro schema names each type once, so the second would read as the first.`,
    );
  });

  it("refuses two records that write to one file", async () => {
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.y")
      namespace A { @Avro.avroRecord model Event { street: string; } }
      @Avro.avroNamespace("com.example.y")
      namespace B { @Avro.avroRecord model Event { zip: int32; } }
      `,
      `duplicate-record: "B.Event" and "A.Event" both write to "/out/com/example/y/Event.avsc". One file holds one schema, so the second would replace the first.`,
    );
  });

  it("writes nothing at all when one record of two is refused", async () => {
    const result = await emitAvro(`
      @Avro.avroNamespace("com.example.a")
      namespace A {
        @Avro.avroRecord model Good { id: string; }
        @Avro.avroRecord model Bad { id: uint32; }
      }
    `);

    expect(Object.keys(result.files)).toEqual([]);
  });
  it("refuses a fixed type of no width", async () => {
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        @Avro.fixed(0) scalar Empty extends bytes;
        @Avro.avroRecord model Event { value: Empty; }
      }
      `,
      `invalid-fixed: "0" is not a width an Avro fixed type can have. A fixed type holds a positive number of bytes.`,
    );
  });

  it("refuses a named type that takes a name Avro keeps", async () => {
    // The name passes the Avro grammar, and it names a primitive. A reader
    // that met this record would read the primitive instead.
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        @Avro.avroRecord model int { value: string; }
      }
      `,
      `invalid-name: Avro keeps the name "int" for a type of its own. A record, an enum and a fixed type take a name that is none of: null, boolean, int, long, float, double, bytes, string, record, enum, array, map, union, fixed.`,
    );
  });

  it("refuses a fixed scalar that does not extend bytes", async () => {
    // An Avro fixed type holds bytes. A fixed string was written out as a
    // fixed type all the same, and what `extends string` said was lost.
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        @Avro.fixed(4) scalar Word extends string;
        @Avro.avroRecord model Event { value: Word; }
      }
      `,
      `invalid-fixed: The scalar "Word" carries @fixed and extends the Avro type "string". An Avro fixed type holds bytes, so a scalar that carries @fixed extends bytes.`,
    );
  });

  it("refuses a fixed model that declares fields", async () => {
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        @Avro.fixed(4) model Word { byte: int32; }
        @Avro.avroRecord model Event { word: Word; }
      }
      `,
      `unsupported-type: The model "Word" carries @fixed and declares fields. An Avro fixed type holds a number of bytes and nothing else, so the fields would be lost.`,
    );
  });

  it("refuses a model that is both a record and a fixed type", async () => {
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        @Avro.fixed(4) @Avro.avroRecord model Word {}
      }
      `,
      `unsupported-type: The model "Word" carries both @record and @fixed. A file holds one schema, and a fixed type is a width rather than a record, so there is nothing to write.`,
    );
  });

  it("refuses a logical type the Avro specification does not define", async () => {
    // `avsc` accepts this one without a word, and it drops the annotation when
    // it writes the schema back out. So this refusal is the only thing between
    // an author and a schema no reader understands.
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        @Avro.logicalType("totally-made-up") scalar Odd extends int32;
        @Avro.avroRecord model Event { value: Odd; }
      }
      `,
      `unknown-logical-type: "totally-made-up" is not a logical type the Avro specification defines. The specification defines decimal, uuid, date, time-millis, time-micros, timestamp-millis, timestamp-micros, local-timestamp-millis, local-timestamp-micros, duration.`,
    );
  });

  it("refuses a logical type written on an underlying type it does not go with", async () => {
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        @Avro.logicalType("uuid") scalar Id extends int32;
        @Avro.avroRecord model Event { id: Id; }
      }
      `,
      `logical-type-mismatch: The logical type "uuid" is written on int. The Avro specification writes it on string.`,
    );
  });

  it("refuses a logical type written on a union", async () => {
    // Avro annotates a type, and a union is not one.
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        @Avro.avroRecord model Event {
          @Avro.logicalType("uuid") id: string | int32;
        }
      }
      `,
      `logical-type-mismatch: The logical type "uuid" is written on a union. The Avro specification writes it on string.`,
    );
  });

  it("refuses a logical type written on a record", async () => {
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        model Address { street: string; }
        @Avro.avroRecord model Event {
          @Avro.logicalType("uuid") at: Address;
        }
      }
      `,
      `logical-type-mismatch: The logical type "uuid" is written on a field that holds the named type "com.example.a.Address". A named type carries one definition wherever it occurs, so the logical type belongs on that declaration.`,
    );
  });

  it("refuses a decimal with no precision", async () => {
    // A reader cannot place the point without one, so the annotation alone
    // describes nothing.
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        @Avro.logicalType("decimal") scalar Money extends bytes;
        @Avro.avroRecord model Event { paid: Money; }
      }
      `,
      `invalid-decimal: An Avro decimal is written with a precision and a scale. A reader cannot place the point without them, so use @decimal rather than @logicalType("decimal").`,
    );
  });

  it("refuses a decimal precision that is not positive", async () => {
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        @Avro.decimal(0, 2) scalar Money extends bytes;
        @Avro.avroRecord model Event { paid: Money; }
      }
      `,
      `invalid-decimal: "0" is not a precision an Avro decimal can have. A decimal holds a positive number of digits.`,
    );
  });

  it("refuses a decimal scale wider than its precision", async () => {
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        @Avro.decimal(2, 5) scalar Money extends bytes;
        @Avro.avroRecord model Event { paid: Money; }
      }
      `,
      `invalid-decimal: A scale of "5" does not fit a precision of "2". The scale counts the digits after the point, so it is neither negative nor larger than the precision.`,
    );
  });

  it("refuses a duration on a fixed type of the wrong width", async () => {
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        @Avro.logicalType("duration") @Avro.fixed(8) scalar Span extends bytes;
        @Avro.avroRecord model Event { span: Span; }
      }
      `,
      `logical-type-mismatch: The logical type "duration" is written on a fixed type of twelve bytes, which hold the months, the days and the milliseconds.`,
    );
  });

  it("refuses a decimal precision wider than the fixed type holds", async () => {
    // A decimal rides in the bytes of the fixed type, and two bytes hold a
    // number of four digits. A precision the width cannot carry describes a
    // number nobody can write.
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        @Avro.decimal(20, 2) @Avro.fixed(2) scalar Odd extends bytes;
        @Avro.avroRecord model Event { odd: Odd; }
      }
      `,
      `invalid-decimal: A precision of "20" does not fit a fixed type of 2 bytes, which hold at most 4 digits.`,
    );
  });

  it("refuses a field logical type on a named type, whichever field carries it", async () => {
    // A named type is written out once and named after that, so an annotation
    // on one field would land in the definition every other field reads. The
    // two orderings have to agree, and they agree by refusing.
    const refusal = `logical-type-mismatch: The logical type "duration" is written on a field that holds the named type "com.example.a.Span". A named type carries one definition wherever it occurs, so the logical type belongs on that declaration.`;
    const event = (fields: string): string => `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        @Avro.fixed(12) scalar Span extends bytes;
        @Avro.avroRecord model Event { ${fields} }
      }
      `;

    await expectRefusal(event(`@Avro.logicalType("duration") a: Span; b: Span;`), refusal);
    await expectRefusal(event(`a: Span; @Avro.logicalType("duration") b: Span;`), refusal);
  });

  it("refuses two logical types on one declaration, in either spelling", async () => {
    // The two decorators write to one place, so the second would replace the
    // first without a word. Which one survives would depend on the order they
    // were written in.
    await expectRefusal(
      `@Avro.logicalType("uuid") @Avro.decimal(9, 2) scalar Odd extends string;`,
      `duplicate-logical-type: This declaration carries the logical types "decimal" and "uuid". Avro writes one logical type on a type, so the second would replace the first.`,
    );

    await expectRefusal(
      `@Avro.decimal(9, 2) @Avro.logicalType("uuid") scalar Odd extends string;`,
      `duplicate-logical-type: This declaration carries the logical types "uuid" and "decimal". Avro writes one logical type on a type, so the second would replace the first.`,
    );
  });

  it("refuses a field order Avro does not name", async () => {
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        @Avro.avroRecord model Event {
          @Avro.order("sideways") id: string;
        }
      }
      `,
      `invalid-order: "sideways" is not an Avro field order. Avro orders a field by "ascending", by "descending", or not at all with "ignore".`,
    );
  });

  it("refuses an alias of a named type that is not a full name", async () => {
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        @Avro.aliases("com.example.old-events.Event")
        @Avro.avroRecord model Event { id: string; }
      }
      `,
      `invalid-name: "com.example.old-events.Event" is not a legal Avro alias. An alias of a named type is a full name: one or more legal Avro names, joined by dots.`,
    );
  });

  it("refuses an alias of a field that is not a name", async () => {
    // A field carries no namespace, so its alias is one plain name.
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        @Avro.avroRecord model Event {
          @Avro.aliases("order.id") id: string;
        }
      }
      `,
      `invalid-name: "order.id" is not a legal Avro name. A name starts with a letter or an underscore, and continues with letters, digits or underscores.`,
    );
  });

  it("refuses a fallback symbol the enum does not declare", async () => {
    await expectRefusal(
      `
      @Avro.avroNamespace("com.example.a")
      namespace A {
        @Avro.enumDefault("NOPE") enum Channel { WEB, MOBILE }
        @Avro.avroRecord model Event { channel: Channel; }
      }
      `,
      `enum-default: The enum "Channel" declares no member named "NOPE". An Avro enum falls back to one of its own symbols.`,
    );
  });
});
