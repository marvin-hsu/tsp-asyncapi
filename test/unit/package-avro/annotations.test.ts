import { describe, it, expect } from "vitest";
import { emitAvroFiles, expectInstanceRoundTrip, fieldNamed } from "../../utils/avro.js";

/**
 * The decorators that carry what Avro has and TypeSpec cannot say.
 *
 * Every expectation here is written by hand, and it is the whole file rather
 * than one member of it. `avsc` cannot stand behind any of this: it accepts a
 * schema without reading an alias, an order or a fallback symbol, and it drops
 * them again when it writes one back out. So the acceptance layer proves the
 * schema is legal, and these expectations prove it says what the author wrote.
 *
 * The order of the keys is pinned too, in the test that owns it. Two runs of
 * this emitter write the same bytes, and a member appearing in a new place
 * would change every file without changing what any of them means.
 */

const NAMESPACE = "com.example.a";

describe("the Avro annotations", () => {
  it("writes the aliases of a record, of a field and of an enum", async () => {
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("${NAMESPACE}")
      namespace A {
        @Avro.aliases("com.example.old.Colour")
        enum Colour { RED, GREEN }

        @Avro.aliases("com.example.old.Event", "Legacy")
        @Avro.avroRecord
        model Event {
          @Avro.aliases("orderId", "order_id") id: string;
          colour: Colour;
        }
      }
    `);

    expect(files["com/example/a/Event.avsc"]).toEqual({
      type: "record",
      name: "Event",
      namespace: NAMESPACE,
      aliases: ["com.example.old.Event", "Legacy"],
      fields: [
        { name: "id", type: "string", aliases: ["orderId", "order_id"] },
        {
          name: "colour",
          type: {
            type: "enum",
            name: "Colour",
            namespace: NAMESPACE,
            aliases: ["com.example.old.Colour"],
            symbols: ["RED", "GREEN"],
          },
        },
      ],
    });
  });

  it("writes no aliases where the author named none", async () => {
    // An empty alias list says nothing a reader can use, so it is nothing to
    // write. Every other member the author left out disappears the same way.
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("${NAMESPACE}")
      namespace A {
        @Avro.aliases()
        @Avro.avroRecord
        model Event { id: string; }
      }
    `);

    expect(files["com/example/a/Event.avsc"]).toEqual({
      type: "record",
      name: "Event",
      namespace: NAMESPACE,
      fields: [{ name: "id", type: "string" }],
    });
  });

  it("writes each of the three field orders, and nothing where none was declared", async () => {
    // Avro reads `ascending` where a field says nothing, so declaring it
    // changes the text of the schema and nothing a reader does.
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("${NAMESPACE}")
      namespace A {
        @Avro.avroRecord
        model Event {
          @Avro.order("ascending") a: string;
          @Avro.order("descending") b: string;
          @Avro.order("ignore") c: string;
          d: string;
        }
      }
    `);

    expect(files["com/example/a/Event.avsc"]).toEqual({
      type: "record",
      name: "Event",
      namespace: NAMESPACE,
      fields: [
        { name: "a", type: "string", order: "ascending" },
        { name: "b", type: "string", order: "descending" },
        { name: "c", type: "string", order: "ignore" },
        { name: "d", type: "string" },
      ],
    });
  });

  it("writes a scalar marked fixed as a named type, and names it again the second time", async () => {
    // A fixed type is a named Avro type, so it obeys the rule every named type
    // obeys: written in full the first time, written by name after that.
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("${NAMESPACE}")
      namespace A {
        @Avro.fixed(16)
        scalar Md5 extends bytes;

        @Avro.avroRecord
        model Event { first: Md5; second: Md5; }
      }
    `);

    const schema = files["com/example/a/Event.avsc"];
    expect(schema).toEqual({
      type: "record",
      name: "Event",
      namespace: NAMESPACE,
      fields: [
        {
          name: "first",
          type: { type: "fixed", name: "Md5", namespace: NAMESPACE, size: 16 },
        },
        { name: "second", type: "com.example.a.Md5" },
      ],
    });

    expectInstanceRoundTrip(schema);
  });

  it("reads @fixed from the scalar a scalar extends", async () => {
    // A scalar that extends a fixed scalar is a fixed type of that width, and
    // it is named after itself, the way a record is named after its model.
    // Reading the leaf alone wrote a bare bytes instead.
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("${NAMESPACE}")
      namespace A {
        @Avro.fixed(16)
        scalar Md5 extends bytes;

        scalar Digest extends Md5;

        @Avro.avroRecord
        model Event { digest: Digest; sum: Md5; }
      }
    `);

    const schema = files["com/example/a/Event.avsc"];
    expect(schema).toEqual({
      type: "record",
      name: "Event",
      namespace: NAMESPACE,
      fields: [
        {
          name: "digest",
          type: { type: "fixed", name: "Digest", namespace: NAMESPACE, size: 16 },
        },
        { name: "sum", type: { type: "fixed", name: "Md5", namespace: NAMESPACE, size: 16 } },
      ],
    });

    expectInstanceRoundTrip(schema);
  });

  it("writes a scalar marked fixed, with the aliases it carries", async () => {
    // `@fixed` makes a named Avro type of a scalar, and a named type is what
    // an alias stands for. A fixed model already took one, and a fixed scalar
    // could not.
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("${NAMESPACE}")
      namespace A {
        @Avro.aliases("com.example.old.Md5")
        @Avro.fixed(16)
        scalar Md5 extends bytes;

        @Avro.avroRecord
        model Event { sum: Md5; }
      }
    `);

    expect(fieldNamed(files["com/example/a/Event.avsc"], "sum").type).toEqual({
      type: "fixed",
      name: "Md5",
      namespace: NAMESPACE,
      aliases: ["com.example.old.Md5"],
      size: 16,
    });
  });

  it("writes a scalar marked fixed, with the aliases written further up the chain", async () => {
    // `@fixed` is read along the chain a scalar extends, and so is `@aliases`.
    // Reading the leaf alone dropped an alias the author wrote on the base.
    // The name of the fixed type comes from the scalar being walked, and the
    // alias the base carries stands for that name.
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("${NAMESPACE}")
      namespace A {
        @Avro.aliases("com.example.old.Md5")
        @Avro.fixed(16)
        scalar Md5 extends bytes;

        scalar Digest extends Md5;

        @Avro.avroRecord
        model Event { sum: Digest; }
      }
    `);

    expect(fieldNamed(files["com/example/a/Event.avsc"], "sum").type).toEqual({
      type: "fixed",
      name: "Digest",
      namespace: NAMESPACE,
      aliases: ["com.example.old.Md5"],
      size: 16,
    });
  });

  it("writes a model marked fixed, with the aliases it carries", async () => {
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("${NAMESPACE}")
      namespace A {
        @Avro.aliases("com.example.old.Digest")
        @Avro.fixed(8)
        model Digest {}

        @Avro.avroRecord
        model Event { digest: Digest; }
      }
    `);

    expect(files["com/example/a/Event.avsc"]).toEqual({
      type: "record",
      name: "Event",
      namespace: NAMESPACE,
      fields: [
        {
          name: "digest",
          type: {
            type: "fixed",
            name: "Digest",
            namespace: NAMESPACE,
            aliases: ["com.example.old.Digest"],
            size: 8,
          },
        },
      ],
    });
  });

  it("writes the fallback symbol of an enum", async () => {
    // A reader that meets a symbol its own schema does not hold reads this one
    // instead. Without it, that reader fails.
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("${NAMESPACE}")
      namespace A {
        @Avro.enumDefault("UNKNOWN")
        enum Channel { UNKNOWN, WEB, MOBILE }

        @Avro.avroRecord
        model Event { channel: Channel; }
      }
    `);

    const schema = files["com/example/a/Event.avsc"];
    expect(schema).toEqual({
      type: "record",
      name: "Event",
      namespace: NAMESPACE,
      fields: [
        {
          name: "channel",
          type: {
            type: "enum",
            name: "Channel",
            namespace: NAMESPACE,
            symbols: ["UNKNOWN", "WEB", "MOBILE"],
            default: "UNKNOWN",
          },
        },
      ],
    });

    expectInstanceRoundTrip(schema);
  });

  it("writes every member in the order the Avro specification lists them", async () => {
    // `JSON.parse` keeps the order the text was written in, so this reads the
    // bytes rather than the meaning. It is what makes two runs the same file.
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("${NAMESPACE}")
      namespace A {
        @Avro.aliases("com.example.old.Channel")
        @Avro.enumDefault("UNKNOWN")
        enum Channel { UNKNOWN, WEB }

        @Avro.fixed(4)
        scalar Word extends bytes;

        /** An event. */
        @Avro.aliases("com.example.old.Event")
        @Avro.avroRecord
        model Event {
          /** The channel. */
          @Avro.aliases("chan")
          @Avro.order("ignore")
          channel?: Channel;

          word: Word;
        }
      }
    `);

    const schema = files["com/example/a/Event.avsc"] as {
      fields: { type: unknown }[];
    };

    expect(Object.keys(schema)).toEqual(["type", "name", "namespace", "doc", "aliases", "fields"]);
    expect(Object.keys(schema.fields[0])).toEqual([
      "name",
      "type",
      "doc",
      "default",
      "order",
      "aliases",
    ]);

    const channel = (schema.fields[0].type as unknown[])[1];
    expect(Object.keys(channel as object)).toEqual([
      "type",
      "name",
      "namespace",
      "aliases",
      "symbols",
      "default",
    ]);
    expect(Object.keys(schema.fields[1].type as object)).toEqual([
      "type",
      "name",
      "namespace",
      "size",
    ]);
  });
});
