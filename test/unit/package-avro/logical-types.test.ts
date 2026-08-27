import { describe, it, expect } from "vitest";
import { emitAvroFiles, expectInstanceRoundTrip, fieldNamed } from "../../utils/avro.js";

/**
 * The logical types, pinned one by one.
 *
 * Nothing checks these but this file. Measured on `avsc@5.7.9`: it accepts
 * `{ type: "int", logicalType: "totally-made-up" }` without a word, and
 * `Type.schema()` gives `"long"` back for a timestamp. So the oracle can say a
 * schema is legal and usable, and it cannot say a single thing about what the
 * annotation means. A hand written expectation per logical type is the whole
 * of the evidence.
 *
 * Each case states the underlying type as well as the annotation, because the
 * pair is what the Avro specification names. The annotation never changes what
 * is on the wire: a reader that does not know it reads the number underneath.
 */

const NAMESPACE = "com.example.a";

/**
 * Emits one field carrying one logical type, and returns the schema of it.
 *
 * @param declaration - The TypeSpec declaration of the field's type
 * @param type - How the field refers to it
 * @returns The rendered type of the field
 */
async function fieldType(declaration: string, type: string): Promise<unknown> {
  const files = await emitAvroFiles(`
    @Avro.avroNamespace("${NAMESPACE}")
    namespace A {
      ${declaration}

      @Avro.avroRecord
      model Event { value: ${type}; }
    }
  `);

  const schema = files["com/example/a/Event.avsc"];
  expectInstanceRoundTrip(schema);
  return fieldNamed(schema, "value").type;
}

describe("the Avro logical types", () => {
  it("writes uuid on a string", async () => {
    expect(
      await fieldType(`@Avro.logicalType("uuid") scalar Uuid extends string;`, "Uuid"),
    ).toEqual({ type: "string", logicalType: "uuid" });
  });

  it("writes date on an int", async () => {
    // A date is the number of days since the epoch, so it fits an int.
    expect(await fieldType(`@Avro.logicalType("date") scalar Day extends int32;`, "Day")).toEqual({
      type: "int",
      logicalType: "date",
    });
  });

  it("writes time-millis on an int", async () => {
    expect(
      await fieldType(`@Avro.logicalType("time-millis") scalar Time extends int32;`, "Time"),
    ).toEqual({ type: "int", logicalType: "time-millis" });
  });

  it("writes time-micros on a long", async () => {
    // Microseconds of one day overflow an int, which is why this pair is wider
    // than the millisecond one.
    expect(
      await fieldType(`@Avro.logicalType("time-micros") scalar Time extends int64;`, "Time"),
    ).toEqual({ type: "long", logicalType: "time-micros" });
  });

  it("writes timestamp-millis on a long", async () => {
    expect(
      await fieldType(`@Avro.logicalType("timestamp-millis") scalar At extends int64;`, "At"),
    ).toEqual({ type: "long", logicalType: "timestamp-millis" });
  });

  it("writes timestamp-micros on a long", async () => {
    expect(
      await fieldType(`@Avro.logicalType("timestamp-micros") scalar At extends int64;`, "At"),
    ).toEqual({ type: "long", logicalType: "timestamp-micros" });
  });

  it("writes local-timestamp-millis on a long", async () => {
    // The local pair carries no time zone. That is the whole difference, and
    // the underlying type is the same.
    expect(
      await fieldType(`@Avro.logicalType("local-timestamp-millis") scalar At extends int64;`, "At"),
    ).toEqual({ type: "long", logicalType: "local-timestamp-millis" });
  });

  it("writes local-timestamp-micros on a long", async () => {
    expect(
      await fieldType(`@Avro.logicalType("local-timestamp-micros") scalar At extends int64;`, "At"),
    ).toEqual({ type: "long", logicalType: "local-timestamp-micros" });
  });

  it("writes decimal on bytes, with its precision and its scale", async () => {
    // A decimal is an unscaled integer plus the place of the point. Both
    // numbers are part of the schema, because a reader cannot place the point
    // without them.
    expect(await fieldType(`@Avro.decimal(9, 2) scalar Money extends bytes;`, "Money")).toEqual({
      type: "bytes",
      logicalType: "decimal",
      precision: 9,
      scale: 2,
    });
  });

  it("writes a scale of zero when the author declared none", async () => {
    expect(await fieldType(`@Avro.decimal(4) scalar Count extends bytes;`, "Count")).toEqual({
      type: "bytes",
      logicalType: "decimal",
      precision: 4,
      scale: 0,
    });
  });

  it("writes decimal on a fixed type", async () => {
    expect(
      await fieldType(`@Avro.decimal(9, 2) @Avro.fixed(4) scalar Money extends bytes;`, "Money"),
    ).toEqual({
      type: "fixed",
      name: "Money",
      namespace: NAMESPACE,
      size: 4,
      logicalType: "decimal",
      precision: 9,
      scale: 2,
    });
  });

  it("writes duration on a fixed type of twelve bytes", async () => {
    // The twelve bytes hold three unsigned four byte numbers: the months, the
    // days and the milliseconds.
    expect(
      await fieldType(
        `@Avro.logicalType("duration") @Avro.fixed(12) scalar Span extends bytes;`,
        "Span",
      ),
    ).toEqual({
      type: "fixed",
      name: "Span",
      namespace: NAMESPACE,
      size: 12,
      logicalType: "duration",
    });
  });

  it("names an annotated fixed type once, and refers to it after that", async () => {
    // The annotation went into the definition, so the second occurrence is a
    // name and nothing else. Writing the annotation again would be a second
    // definition of one name, which Avro forbids.
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("${NAMESPACE}")
      namespace A {
        @Avro.decimal(9, 2)
        @Avro.fixed(4)
        scalar Money extends bytes;

        @Avro.avroRecord
        model Event { paid: Money; refunded: Money; }
      }
    `);

    const schema = files["com/example/a/Event.avsc"];
    expect(fieldNamed(schema, "paid").type).toEqual({
      type: "fixed",
      name: "Money",
      namespace: NAMESPACE,
      size: 4,
      logicalType: "decimal",
      precision: 9,
      scale: 2,
    });
    expect(fieldNamed(schema, "refunded").type).toBe("com.example.a.Money");

    expectInstanceRoundTrip(schema);
  });

  it("writes a logical type declared on the field rather than on the scalar", async () => {
    // The annotation belongs to the field here, so the scalar stays a plain
    // long and only this one field carries the meaning.
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("${NAMESPACE}")
      namespace A {
        @Avro.avroRecord
        model Event {
          @Avro.logicalType("timestamp-millis") at: int64;
          plain: int64;
        }
      }
    `);

    expect(files["com/example/a/Event.avsc"]).toEqual({
      type: "record",
      name: "Event",
      namespace: NAMESPACE,
      fields: [
        { name: "at", type: { type: "long", logicalType: "timestamp-millis" } },
        { name: "plain", type: "long" },
      ],
    });
  });

  it("reads a logical type from the scalar a scalar extends", async () => {
    // A TypeSpec scalar carries what it extends, so a project that names its
    // own scalar over an annotated one means the annotation. Reading the leaf
    // alone wrote a bare long, which is the same type and a different meaning.
    expect(
      await fieldType(
        `@Avro.logicalType("timestamp-millis") scalar Ts extends int64; scalar CreatedAt extends Ts;`,
        "CreatedAt",
      ),
    ).toEqual({ type: "long", logicalType: "timestamp-millis" });
  });

  it("reads the nearest logical type in a base chain", async () => {
    // The nearest declaration wins, because that is the one the author wrote
    // last about this scalar.
    expect(
      await fieldType(
        `@Avro.logicalType("timestamp-millis") scalar Ts extends int64; @Avro.logicalType("timestamp-micros") scalar Precise extends Ts;`,
        "Precise",
      ),
    ).toEqual({ type: "long", logicalType: "timestamp-micros" });
  });

  it("annotates the branch rather than the union when the field is optional", async () => {
    // Avro annotates a type, and a union is not one. So the null branch sits
    // beside the annotated long, and the whole field is not annotated.
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("${NAMESPACE}")
      namespace A {
        @Avro.logicalType("timestamp-millis") scalar At extends int64;

        @Avro.avroRecord
        model Event { at?: At; }
      }
    `);

    const schema = files["com/example/a/Event.avsc"];
    expect(fieldNamed(schema, "at")).toEqual({
      name: "at",
      type: ["null", { type: "long", logicalType: "timestamp-millis" }],
      default: null,
    });

    expectInstanceRoundTrip(schema);
  });
});
