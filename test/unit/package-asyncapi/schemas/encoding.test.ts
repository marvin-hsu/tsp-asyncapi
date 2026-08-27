import { describe, it, expect } from "vitest";
import { holderProperties } from "../../../utils/schema-host.js";

/**
 * `@encode` says how a value travels, which is a separate question from what
 * the value is. A `utcDateTime` is a moment in time either way, but
 * `@encode("unixTimestamp", int32)` makes it arrive as an integer rather than
 * an RFC 3339 string.
 *
 * A schema that reads only the type describes a shape the producer never
 * sends. Every case here pins the emitted `type`/`format` to what actually
 * travels.
 */
describe("Unit: Schemas — @encode", () => {
  it("turns a unixTimestamp date-time into an integer", async () => {
    const props = await holderProperties(`
      model Holder {
        @encode("unixTimestamp", int32)
        ts: utcDateTime;
      }
    `);

    // Without this, the document declares a string while the wire carries a
    // number, and every valid message fails validation.
    expect(props.ts).toEqual({ type: "integer", format: "unixtime" });
  });

  it("keeps the integer type when the encode target is a wider integer", async () => {
    const props = await holderProperties(`
      model Holder {
        @encode("unixTimestamp", int64)
        ts: utcDateTime;
      }
    `);

    expect(props.ts).toEqual({ type: "integer", format: "unixtime" });
  });

  it("maps an rfc7231 date-time to the http-date format", async () => {
    const props = await holderProperties(`
      model Holder {
        @encode(DateTimeKnownEncoding.rfc7231)
        ts: utcDateTime;
      }
    `);

    // The value stays a string here. Only the format changes, because
    // RFC 7231 spells a date differently from RFC 3339.
    expect(props.ts).toEqual({ type: "string", format: "http-date" });
  });

  it("leaves an explicit rfc3339 date-time as the default shape", async () => {
    const props = await holderProperties(`
      model Holder {
        @encode("rfc3339")
        ts: utcDateTime;
      }
    `);

    // RFC 3339 is already how an un-encoded `utcDateTime` travels, so writing
    // it out changes nothing.
    expect(props.ts).toEqual({ type: "string", format: "date-time" });
  });

  it("turns a seconds-encoded duration into an integer", async () => {
    const props = await holderProperties(`
      model Holder {
        @encode("seconds", int32)
        d: duration;
      }
    `);

    // A duration has no named format for a seconds count, so the format comes
    // from the encode target instead of the encoding name.
    expect(props.d).toEqual({ type: "integer", format: "int32" });
  });

  it("leaves an ISO8601 duration as the default shape", async () => {
    const props = await holderProperties(`
      model Holder {
        @encode(DurationKnownEncoding.ISO8601)
        d: duration;
      }
    `);

    expect(props.d).toEqual({ type: "string", format: "duration" });
  });

  it("carries a bytes encoding into the format", async () => {
    const props = await holderProperties(`
      model Holder {
        @encode("base64url")
        b: bytes;
      }
    `);

    // `bytes` defaults to `byte`, which means plain base64. base64url uses a
    // different alphabet, so the two are not interchangeable.
    expect(props.b).toEqual({ type: "string", format: "base64url" });
  });

  it("applies an encoding declared on a scalar to every use site", async () => {
    const props = await holderProperties(`
      @encode("unixTimestamp", int32)
      scalar Epoch extends utcDateTime;
      model Holder {
        a: Epoch;
        b: Epoch;
      }
    `);

    expect(props.a).toEqual({ type: "integer", format: "unixtime" });
    expect(props.b).toEqual({ type: "integer", format: "unixtime" });
  });

  it("inherits an encoding through a chain of derived scalars", async () => {
    const props = await holderProperties(`
      @encode("unixTimestamp", int32)
      scalar Epoch extends utcDateTime;
      scalar EventTime extends Epoch;
      model Holder {
        a: EventTime;
      }
    `);

    expect(props.a).toEqual({ type: "integer", format: "unixtime" });
  });

  it("lets a derived scalar's own encoding override the one it inherits", async () => {
    const props = await holderProperties(`
      @encode("unixTimestamp", int32)
      scalar Epoch extends utcDateTime;
      @encode(DateTimeKnownEncoding.rfc7231)
      scalar HttpTime extends Epoch;
      model Holder {
        a: HttpTime;
      }
    `);

    // The derived scalar re-declares how its value travels. Its own answer is
    // the one that reaches the wire, so it wins over the base's.
    expect(props.a).toEqual({ type: "string", format: "http-date" });
  });

  it("lets a property's encoding override the scalar's", async () => {
    const props = await holderProperties(`
      @encode("unixTimestamp", int32)
      scalar Epoch extends utcDateTime;
      model Holder {
        @encode(DateTimeKnownEncoding.rfc7231)
        a: Epoch;
      }
    `);

    expect(props.a).toEqual({ type: "string", format: "http-date" });
  });

  it("encodes two properties of one scalar independently", async () => {
    const props = await holderProperties(`
      @encode("unixTimestamp", int32)
      scalar Epoch extends utcDateTime;
      model Holder {
        inherited: Epoch;
        @encode(DateTimeKnownEncoding.rfc7231)
        overridden: Epoch;
      }
    `);

    // One property overriding the scalar's encoding must not change what the
    // other property, or the scalar itself, resolves to.
    expect(props.inherited).toEqual({ type: "integer", format: "unixtime" });
    expect(props.overridden).toEqual({ type: "string", format: "http-date" });
  });

  it("carries the property's documentation through the encoding", async () => {
    const props = await holderProperties(`
      model Holder {
        /** When the order was placed. */
        @encode("unixTimestamp", int32)
        ts: utcDateTime;
      }
    `);

    expect(props.ts).toEqual({
      type: "integer",
      format: "unixtime",
      description: "When the order was placed.",
    });
  });

  it("encodes a default value the same way it encodes the schema", async () => {
    const props = await holderProperties(`
      model Holder {
        @encode("unixTimestamp", int32)
        ts?: utcDateTime = utcDateTime.fromISO("2020-01-01T00:00:00Z");
      }
    `);

    // A default described as an integer but written as a string would not
    // validate against the schema carrying it.
    expect(props.ts).toEqual({
      type: "integer",
      format: "unixtime",
      default: 1577836800,
    });
  });

  it("leaves a property with no encoding untouched", async () => {
    const props = await holderProperties(`
      model Holder {
        ts: utcDateTime;
        d: duration;
        b: bytes;
      }
    `);

    expect(props.ts).toEqual({ type: "string", format: "date-time" });
    expect(props.d).toEqual({ type: "string", format: "duration" });
    expect(props.b).toEqual({ type: "string", format: "byte" });
  });
  /**
   * A nullable value is a union, and only one of its variants is the value
   * the encoding describes. Writing the encoded `type` on the union itself
   * puts `type: "integer"` beside an `anyOf` of a string and a null, and no
   * value satisfies all three at once.
   */
  describe("a union-typed property", () => {
    it("encodes the variant the encoding describes and leaves null alone", async () => {
      const props = await holderProperties(`
        model Holder {
          @encode("unixTimestamp", int32)
          ts: utcDateTime | null;
        }
      `);

      expect(props.ts).toEqual({
        anyOf: [{ type: "integer", format: "unixtime" }, { type: "null" }],
      });
    });

    it("encodes a named scalar variant in place of its reference", async () => {
      const props = await holderProperties(`
        scalar Epoch extends utcDateTime;
        model Holder {
          @encode("unixTimestamp", int32)
          ts: Epoch | null;
        }
      `);

      // The component describes the un-encoded scalar, so a reference to it
      // would describe a string where an integer travels.
      expect(props.ts).toEqual({
        anyOf: [{ type: "integer", format: "unixtime" }, { type: "null" }],
      });
    });

    it("encodes every variant the encoding describes", async () => {
      const props = await holderProperties(`
        model Holder {
          @encode("unixTimestamp", int32)
          ts: utcDateTime | offsetDateTime;
        }
      `);

      expect(props.ts).toEqual({
        anyOf: [
          { type: "integer", format: "unixtime" },
          { type: "integer", format: "unixtime" },
        ],
      });
    });
  });
});
