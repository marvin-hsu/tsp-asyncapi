import { describe, it, expect, beforeEach } from "vitest";
import { AsyncAPITester } from "#emitter/testing.js";
import { TesterInstance } from "@typespec/compiler/testing";
import { byCodePoint } from "../../../utils/sort.js";
import { getRawPayload, listMessages } from "#core/decorators/index.js";
import { documentFrom } from "../../../utils/test-host.js";

/** The Avro format identifier AsyncAPI recommends. */
const AVRO = "application/vnd.apache.avro;version=1.9.0";

describe("Unit: Message raw schemas: @rawPayload (Phase 3.9)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("emits a Multi Format Schema Object as the payload", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${AVRO}", #{
        type: "record",
        name: "OrderCreated",
        fields: #[#{ name: "orderId", type: "string" }]
      })
      model OrderCreated {}
    `);

    const doc = await documentFrom(runner.program);

    expect(doc.components?.messages?.OrderCreated).toEqual({
      name: "OrderCreated",
      payload: {
        schemaFormat: AVRO,
        schema: {
          type: "record",
          name: "OrderCreated",
          fields: [{ name: "orderId", type: "string" }],
        },
      },
    });
  });

  it("contributes nothing to components.schemas from a raw payload", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model Address {
        city: string;
      }

      @message
      @rawPayload("${AVRO}", #{ type: "record", name: "OrderCreated" })
      model OrderCreated {
        orderId: string;
        shipTo: Address;
      }
    `);

    const doc = await documentFrom(runner.program);

    // The model is a carrier for the decorators. Its own properties describe
    // nothing the document emits, so neither the model nor the models it
    // refers to claim a key.
    expect(doc.components?.schemas).toBeUndefined();
    expect(doc.components?.messages?.OrderCreated.payload).toEqual({
      schemaFormat: AVRO,
      schema: { type: "record", name: "OrderCreated" },
    });
  });

  it("still collects a model that another, non-raw message reaches", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model Address {
        city: string;
      }

      @message
      @rawPayload("${AVRO}", #{ type: "record", name: "Raw" })
      model RawOrder {
        shipTo: Address;
      }

      @message
      model PlainOrder {
        shipTo: Address;
      }
    `);

    const doc = await documentFrom(runner.program);

    // Reachability is unchanged. The raw message simply stops being a root of
    // the walk, and every other message still collects what it reaches.
    expect(Object.keys(doc.components?.schemas ?? {}).sort(byCodePoint)).toEqual([
      "Address",
      "PlainOrder",
    ]);
  });

  it("still collects the raw model itself when another message reaches it", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${AVRO}", #{ type: "record", name: "Raw" })
      model RawOrder {
        id: string;
      }

      @message
      model Wrapper {
        order: RawOrder;
      }
    `);

    const doc = await documentFrom(runner.program);

    // The raw model is not exempt from the schema walk. It only stops being a
    // root of it. Another message reaches it as a property type here, so it
    // gets its ordinary JSON Schema entry, properties and all. Leaving it out
    // would make the other message point at nothing.
    expect(doc.components?.schemas?.RawOrder).toEqual({
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    });
    // Its own message still carries the raw schema, not that entry.
    expect(doc.components?.messages?.RawOrder.payload).toEqual({
      schemaFormat: AVRO,
      schema: { type: "record", name: "Raw" },
    });
    expect(runner.program.diagnostics).toHaveLength(0);
  });

  it("emits no $ref for a raw payload, so no key is claimed for it", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${AVRO}", #{ type: "record", name: "OrderCreated" })
      model OrderCreated {}

      @message
      model OrderCreatedPayload {
        note: string;
      }
    `);

    const doc = await documentFrom(runner.program);

    // A lifting message reserves a derived `<Key>Payload` key. A raw payload
    // reserves none, so a model with that very name stays free of a clash.
    expect(runner.program.diagnostics).toHaveLength(0);
    expect(Object.keys(doc.components?.schemas ?? {})).toEqual(["OrderCreatedPayload"]);
  });

  it("accepts a schema that is not an object, because the spec types it as any", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${AVRO}", "string")
      model OrderCreated {}
    `);

    const doc = await documentFrom(runner.program);

    expect(doc.components?.messages?.OrderCreated.payload).toEqual({
      schemaFormat: AVRO,
      schema: "string",
    });
  });

  it("keeps the rest of the message next to a raw payload", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @contentType("application/avro")
      @doc("An order a customer placed.")
      @rawPayload("${AVRO}", #{ type: "record", name: "OrderCreated" })
      model OrderCreated {}
    `);

    const doc = await documentFrom(runner.program);

    expect(doc.components?.messages?.OrderCreated).toEqual({
      name: "OrderCreated",
      description: "An order a customer placed.",
      contentType: "application/avro",
      payload: { schemaFormat: AVRO, schema: { type: "record", name: "OrderCreated" } },
    });
  });

  it("reads the recorded state back through getRawPayload", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${AVRO}", #{ type: "record" })
      model OrderCreated {}
    `);

    const models = [...listMessages(runner.program).keys()];
    expect(models).toHaveLength(1);
    const model = models[0];
    expect(getRawPayload(runner.program, model)).toEqual({
      schemaFormat: AVRO,
      schema: { type: "record" },
    });
  });
});
