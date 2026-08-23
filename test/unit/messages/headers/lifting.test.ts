import { describe, it, expect, beforeEach } from "vitest";
import { AsyncAPITester } from "#emitter/testing/index.js";
import { TesterInstance } from "@typespec/compiler/testing";
import { diagnosticsWith, findDiagnostic } from "../../../utils/diagnostics.js";
import { documentFrom } from "../../../utils/test-host.js";

describe("Unit: Message headers: lifting fields (Phase 3.3)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });
  it("separates header fields from payload fields on one message", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        @header
        correlationId: string;

        @header
        retryCount?: int32;

        orderId: string;
        total: float64;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(doc.components?.messages?.OrderCreated).toEqual({
      name: "OrderCreated",
      headers: {
        type: "object",
        properties: {
          correlationId: { type: "string" },
          retryCount: { type: "integer", format: "int32" },
        },
        required: ["correlationId"],
      },
      payload: { $ref: "#/components/schemas/OrderCreatedPayload" },
    });
    // The lifted fields belong to `headers`, so the payload must not describe
    // them. They leave a payload component of their own rather than the
    // model's own entry, which every other reader of the model still shares.
    expect(doc.components?.schemas?.OrderCreatedPayload).toEqual({
      type: "object",
      properties: {
        orderId: { type: "string" },
        total: { type: "number", format: "double" },
      },
      required: ["orderId", "total"],
    });
    // Nothing else reads `OrderCreated` here, so the derived component is the
    // only schema the document needs.
    expect(Object.keys(doc.components?.schemas ?? {})).toEqual(["OrderCreatedPayload"]);
  });

  it("keeps a header field's documentation and validation keywords", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        @header
        @doc("Ties this message to the request that caused it.")
        @minLength(8)
        correlationId: string;

        orderId: string;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(doc.components?.messages?.OrderCreated.headers).toEqual({
      type: "object",
      properties: {
        correlationId: {
          type: "string",
          description: "Ties this message to the request that caused it.",
          minLength: 8,
        },
      },
      required: ["correlationId"],
    });
  });

  it("keys a header by its encoded name", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        @header
        @encodedName("application/json", "x-correlation-id")
        correlationId: string;

        orderId: string;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(doc.components?.messages?.OrderCreated.headers).toEqual({
      type: "object",
      properties: { "x-correlation-id": { type: "string" } },
      required: ["x-correlation-id"],
    });
  });

  it("emits an empty object payload when every field is a header", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Ping {
        @header
        sentAt: utcDateTime;
      }
    `);

    const doc = documentFrom(runner.program);

    // Every field went to `headers`, so the payload component is an object
    // with no properties. AsyncAPI still requires a payload, so the message
    // points at that empty object rather than at nothing.
    expect(doc.components?.schemas?.PingPayload).toEqual({ type: "object" });
    expect(doc.components?.messages?.Ping.payload).toEqual({
      $ref: "#/components/schemas/PingPayload",
    });
    expect(Object.keys(doc.components?.schemas ?? {})).toEqual(["PingPayload"]);
    expect(doc.components?.messages?.Ping.headers).toEqual({
      type: "object",
      properties: { sentAt: { type: "string", format: "date-time" } },
      required: ["sentAt"],
    });
  });

  it("leaves out headers when the message declares none", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        orderId: string;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(doc.components?.messages?.OrderCreated).toEqual({
      name: "OrderCreated",
      payload: { $ref: "#/components/schemas/OrderCreated" },
    });
    expect(Object.hasOwn(doc.components?.messages?.OrderCreated ?? {}, "headers")).toBe(false);
  });

  it("accepts a record-backed model as the headers of a message", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model StringHeaders is Record<string>;

      @message
      @headers(StringHeaders)
      model OrderCreated {
        orderId: string;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(doc.components?.messages?.OrderCreated.headers).toEqual({
      $ref: "#/components/schemas/StringHeaders",
    });
    expect(doc.components?.schemas?.StringHeaders).toEqual({
      type: "object",
      additionalProperties: { type: "string" },
    });
  });

  it("reports an error when one message declares headers twice", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model MessageHeaders {
        traceId: string;
      }

      @message
      @headers(MessageHeaders)
      model OrderCreated {
        @header
        correlationId: string;

        orderId: string;
      }
    `);

    const doc = documentFrom(runner.program);

    const diagnostic = findDiagnostic(runner.program.diagnostics, "duplicate-message-headers");
    expect(diagnostic.severity).toBe("error");
    // Neither source wins, so the message carries no headers at all, and the
    // marked field stays in the payload rather than disappearing.
    expect(doc.components?.messages?.OrderCreated).toEqual({
      name: "OrderCreated",
      payload: { $ref: "#/components/schemas/OrderCreated" },
    });
    expect(doc.components?.schemas?.OrderCreated).toEqual({
      type: "object",
      properties: {
        correlationId: { type: "string" },
        orderId: { type: "string" },
      },
      required: ["correlationId", "orderId"],
    });
    // The cancelled field sits where the emitter does support it, so it must
    // not also be reported as a misplaced mark.
    expect(diagnosticsWith(runner.program.diagnostics, "nested-header-ignored")).toHaveLength(0);
  });

  it("warns about a @header that is not a top-level field of a message", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model Envelope {
        @header
        traceId: string;

        value: string;
      }

      @message
      model OrderCreated {
        envelope: Envelope;
        orderId: string;
      }
    `);

    const doc = documentFrom(runner.program);

    const diagnostics = diagnosticsWith(runner.program.diagnostics, "nested-header-ignored");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe("warning");
    // The mark is ignored, so the field keeps its place in the payload.
    expect(doc.components?.messages?.OrderCreated.headers).toBeUndefined();
    expect(doc.components?.schemas?.Envelope).toEqual({
      type: "object",
      properties: {
        traceId: { type: "string" },
        value: { type: "string" },
      },
      required: ["traceId", "value"],
    });
  });

  it("ignores a @header on a model that no message reaches", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model Unreferenced {
        @header
        traceId: string;
      }

      @message
      model OrderCreated {
        orderId: string;
      }
    `);

    documentFrom(runner.program);

    expect(diagnosticsWith(runner.program.diagnostics, "nested-header-ignored")).toHaveLength(0);
  });

  it("keeps the documentation of a lifting message on its payload", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @doc("The order that was created.")
      @summary("Order created")
      @message
      model OrderCreated {
        @header
        h: string;

        body: string;
      }
    `);

    const doc = documentFrom(runner.program);

    // The payload component is the only schema this document emits for the
    // model, so the documentation of the model must land on it.
    expect(doc.components?.schemas?.OrderCreatedPayload).toEqual({
      type: "object",
      title: "Order created",
      description: "The order that was created.",
      properties: { body: { type: "string" } },
      required: ["body"],
    });
  });
});
