import { describe, it, expect, beforeEach } from "vitest";
import { AsyncAPITester } from "#emitter/testing/index.js";
import { TesterInstance } from "@typespec/compiler/testing";
import { diagnosticsWith } from "../../../utils/diagnostics.js";
import { documentFrom } from "../../../utils/test-host.js";

/** The Avro format identifier AsyncAPI recommends. */
const AVRO = "application/vnd.apache.avro;version=1.9.0";

/** Every diagnostic the compile and the build reported, in one list. */
function allDiagnostics(runner: TesterInstance, reported: readonly { code: string }[] = []) {
  return [...reported, ...runner.program.diagnostics];
}

describe("Unit: Message raw schemas: conflicts (Phase 3.9)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("reports a second @rawPayload and keeps the first application to run", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${AVRO}", #{ name: "second" })
      @rawPayload("${AVRO}", #{ name: "first" })
      model OrderCreated {}
    `);

    const reported = diagnosticsWith(diagnostics, "duplicate-raw-payload-decorator");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");

    // Decorators on one declaration run bottom-up, so the application written
    // last in the source runs first and wins.
    const doc = documentFrom(runner.program);
    expect(doc.components?.messages?.OrderCreated.payload).toEqual({
      schemaFormat: AVRO,
      schema: { name: "first" },
    });
  });

  it("reports a second @rawHeaders", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawHeaders("${AVRO}", #{ name: "second" })
      @rawHeaders("${AVRO}", #{ name: "first" })
      model OrderCreated {
        orderId: string;
      }
    `);

    const reported = diagnosticsWith(diagnostics, "duplicate-raw-headers-decorator");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");

    const doc = documentFrom(runner.program);
    expect(doc.components?.messages?.OrderCreated.headers).toEqual({
      schemaFormat: AVRO,
      schema: { name: "first" },
    });
  });

  it("reports @rawHeaders next to a field-level @header, and emits neither", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawHeaders("${AVRO}", #{ type: "record", name: "Meta" })
      model OrderCreated {
        @header
        traceId: string;

        orderId: string;
      }
    `);

    const doc = documentFrom(runner.program);

    const reported = diagnosticsWith(runner.program.diagnostics, "duplicate-message-headers");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");
    expect(reported[0]?.message).toContain("@rawHeaders");

    // Neither source takes effect, so the field stays in the payload and
    // nothing the author wrote disappears from the document.
    expect(doc.components?.messages?.OrderCreated).toEqual({
      name: "OrderCreated",
      payload: { $ref: "#/components/schemas/OrderCreated" },
    });
    expect(doc.components?.schemas?.OrderCreated).toEqual({
      type: "object",
      properties: { traceId: { type: "string" }, orderId: { type: "string" } },
      required: ["traceId", "orderId"],
    });
  });

  it("reports @rawHeaders next to @headers, and emits neither", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model OrderHeaders {
        traceId: string;
      }

      @message
      @headers(OrderHeaders)
      @rawHeaders("${AVRO}", #{ type: "record", name: "Meta" })
      model OrderCreated {
        orderId: string;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(diagnosticsWith(runner.program.diagnostics, "duplicate-message-headers")).toHaveLength(
      1,
    );
    expect(Object.hasOwn(doc.components?.messages?.OrderCreated ?? {}, "headers")).toBe(false);
  });

  it("reports a raw payload that also lifts @header fields, and emits both halves", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${AVRO}", #{ type: "record", name: "OrderCreated" })
      model OrderCreated {
        @header
        traceId: string;

        orderId: string;
      }
    `);

    const doc = documentFrom(runner.program);

    const reported = diagnosticsWith(runner.program.diagnostics, "raw-payload-lifted-header");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");
    expect(reported[0]?.message).toContain("'OrderCreated'");

    // Both halves reach the document. The emitter cannot take `traceId` out of
    // a schema it does not read, and that is what the diagnostic names.
    expect(doc.components?.messages?.OrderCreated).toEqual({
      name: "OrderCreated",
      headers: {
        type: "object",
        properties: { traceId: { type: "string" } },
        required: ["traceId"],
      },
      payload: { schemaFormat: AVRO, schema: { type: "record", name: "OrderCreated" } },
    });
    // No derived payload component is built, so no orphan key is reserved.
    expect(doc.components?.schemas).toBeUndefined();
  });

  it("reports a raw payload whose lifted fields come from a base message", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model BaseEvent {
        @header
        traceId: string;

        body: string;
      }

      @message
      @rawPayload("${AVRO}", #{ type: "record", name: "OrderCreated" })
      model OrderCreated extends BaseEvent {
        orderId: string;
      }
    `);

    documentFrom(runner.program);

    const reported = diagnosticsWith(runner.program.diagnostics, "raw-payload-lifted-header");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.message).toContain("'OrderCreated'");
  });

  it("reports @rawHeaders that cancels the lift of a base message, and keeps the raw schema", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model BaseEvent {
        @header
        traceId: string;

        body: string;
      }

      @message
      @rawHeaders("${AVRO}", #{ type: "record", name: "Meta" })
      model OrderCreated extends BaseEvent {
        orderId: string;
      }
    `);

    const doc = documentFrom(runner.program);

    // The base message lifts `traceId`, and `@rawHeaders` describes the whole
    // headers object. So the lift is cancelled and the field stays in the
    // payload of the derived message.
    const reported = diagnosticsWith(runner.program.diagnostics, "inherited-header-overridden");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.message).toContain("traceId");

    // The raw schema is what the message emits. Adopting the inherited field
    // would overwrite it.
    expect(doc.components?.messages?.OrderCreated.headers).toEqual({
      schemaFormat: AVRO,
      schema: { type: "record", name: "Meta" },
    });
  });

  it("adopts no inherited lift for a message whose header sources conflict", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model BaseEvent {
        @header
        traceId: string;

        body: string;
      }

      @message
      @rawHeaders("${AVRO}", #{ type: "record", name: "Meta" })
      model OrderCreated extends BaseEvent {
        @header
        ownH: string;

        orderId: string;
      }
    `);

    const doc = documentFrom(runner.program);

    // The derived message declares two header sources, so it gets none of
    // them. What it declares is what decides that, not what it resolved to.
    // A message with an unresolved conflict must not adopt the lift of its
    // base message, because that would emit a `headers` object next to the
    // error that says none was emitted.
    const reported = diagnosticsWith(runner.program.diagnostics, "duplicate-message-headers");
    expect(reported).toHaveLength(1);
    expect(Object.hasOwn(doc.components?.messages?.OrderCreated ?? {}, "headers")).toBe(false);
    // The conflict is the only thing reported. The cancelled lift is not a
    // second mistake to name.
    expect(diagnosticsWith(runner.program.diagnostics, "inherited-header-overridden")).toHaveLength(
      0,
    );
  });

  it("reports nothing for a raw payload beside @headers or @rawHeaders", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawHeaders("${AVRO}", #{ type: "record", name: "Meta" })
      @rawPayload("${AVRO}", #{ type: "record", name: "Body" })
      model OrderCreated {}
    `);

    documentFrom(runner.program);

    expect(allDiagnostics(runner)).toHaveLength(0);
  });

  it("leaves a nested @header of a raw-payload message alone", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model Nested {
        @header
        traceId: string;
      }

      @message
      @rawPayload("${AVRO}", #{ type: "record", name: "OrderCreated" })
      model OrderCreated {
        nested: Nested;
      }
    `);

    documentFrom(runner.program);

    // Both wordings tell the author that the mark stays in the payload
    // schema. A raw payload has no schema built from the model, so the
    // message would name a place that does not exist.
    expect(runner.program.diagnostics).toHaveLength(0);
  });

  it("still reports a nested @header that another, non-raw message reaches", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model Nested {
        @header
        traceId: string;
      }

      @message
      @rawPayload("${AVRO}", #{ type: "record", name: "Raw" })
      model RawOrder {
        nested: Nested;
      }

      @message
      model PlainOrder {
        nested: Nested;
      }
    `);

    documentFrom(runner.program);

    const reported = diagnosticsWith(runner.program.diagnostics, "nested-header-ignored");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("warning");
  });

  it("queues no discriminated subtype for a model whose payload is raw", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @discriminator("kind")
      @rawPayload("${AVRO}", #{ type: "record", name: "Pet" })
      model Pet {
        kind: string;
      }

      model Cat extends Pet {
        kind: "cat";
        meows: boolean;
      }
    `);

    const doc = documentFrom(runner.program);

    // Nothing is built from the model, so the discriminator reaches no
    // schema and pulls in no subtype.
    expect(runner.program.diagnostics).toHaveLength(0);
    expect(doc.components?.schemas).toBeUndefined();
  });
});
