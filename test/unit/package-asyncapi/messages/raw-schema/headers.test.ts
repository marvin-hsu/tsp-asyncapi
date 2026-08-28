import { describe, it, expect, beforeEach } from "vitest";
import { AsyncAPITester } from "#emitter/testing.js";
import { TesterInstance } from "@typespec/compiler/testing";
import { getRawHeaders, listMessages } from "#core/decorators/index.js";
import { documentFrom } from "../../../../utils/test-host.js";

/** The Avro format identifier AsyncAPI recommends. */
const AVRO = "application/vnd.apache.avro;version=1.9.0";

describe("Unit: Message raw schemas: @rawHeaders (Phase 3.9)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("emits a Multi Format Schema Object as the headers", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawHeaders("${AVRO}", #{
        type: "record",
        name: "Meta",
        fields: #[#{ name: "traceId", type: "string" }]
      })
      model OrderCreated {
        orderId: string;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(doc.components?.messages?.OrderCreated).toEqual({
      name: "OrderCreated",
      headers: {
        schemaFormat: AVRO,
        schema: {
          type: "record",
          name: "Meta",
          fields: [{ name: "traceId", type: "string" }],
        },
      },
      payload: { $ref: "#/components/schemas/OrderCreated" },
    });
    // The payload still comes from the model with every field. Raw headers
    // lift nothing out of it.
    expect(doc.components?.schemas?.OrderCreated).toEqual({
      type: "object",
      properties: { orderId: { type: "string" } },
      required: ["orderId"],
    });
  });

  it("shapes both slots with one and the same container", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${AVRO}", #{ type: "record", name: "Body" })
      @rawHeaders("${AVRO}", #{ type: "record", name: "Body" })
      model OrderCreated {}
    `);

    const doc = await documentFrom(runner.program);
    const message = doc.components?.messages?.OrderCreated;

    // Both slots come from the same function, so identical input produces
    // identical output, not two independently hand-written containers.
    expect(message?.payload).toEqual(message?.headers);
    expect(message?.headers).toEqual({
      schemaFormat: AVRO,
      schema: { type: "record", name: "Body" },
    });
  });

  it("combines a raw payload with a @headers model", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model OrderHeaders {
        traceId: string;
      }

      @message
      @headers(OrderHeaders)
      @rawPayload("${AVRO}", #{ type: "record", name: "OrderCreated" })
      model OrderCreated {}
    `);

    const doc = await documentFrom(runner.program);

    // This is the recommended pair, so nothing is reported. The headers model
    // still gets its own component, because it goes through the schema layer.
    expect(runner.program.diagnostics).toHaveLength(0);
    expect(doc.components?.messages?.OrderCreated).toEqual({
      name: "OrderCreated",
      headers: { $ref: "#/components/schemas/OrderHeaders" },
      payload: { schemaFormat: AVRO, schema: { type: "record", name: "OrderCreated" } },
    });
    expect(Object.keys(doc.components?.schemas ?? {})).toEqual(["OrderHeaders"]);
  });

  it("emits no components entry for a raw headers schema", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawHeaders("${AVRO}", #{ type: "record", name: "Meta" })
      @rawPayload("${AVRO}", #{ type: "record", name: "Body" })
      model OrderCreated {}
    `);

    const doc = await documentFrom(runner.program);

    expect(doc.components?.schemas).toBeUndefined();
  });

  it("reads the recorded state back through getRawHeaders", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawHeaders("${AVRO}", #{ type: "record" })
      model OrderCreated {
        orderId: string;
      }
    `);

    const models = [...listMessages(runner.program).keys()];
    expect(models).toHaveLength(1);
    const model = models[0];
    expect(getRawHeaders(runner.program, model)).toEqual({
      schemaFormat: AVRO,
      schema: { type: "record" },
    });
  });
});
