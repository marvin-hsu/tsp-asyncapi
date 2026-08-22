import { describe, it, expect, beforeEach } from "vitest";
import { AsyncAPITester } from "../../../src/testing/index.js";
import { TesterInstance } from "@typespec/compiler/testing";
import { documentFrom, emitDocumentWithDiagnostics } from "../../utils/test-host.js";
import { byCodePoint } from "../../utils/sort.js";
import { messagesOf } from "../../utils/document.js";
import { diagnosticsWith } from "../../utils/diagnostics.js";

describe("Unit: Message correlationId (Phase 3.4)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("emits location and description on the message", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @correlationId("$message.header#/correlationId", "Ties a reply to its request.")
      model OrderCreated {
        @header
        correlationId: string;

        orderId: string;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(messagesOf(doc).OrderCreated.correlationId).toEqual({
      location: "$message.header#/correlationId",
      description: "Ties a reply to its request.",
    });
  });

  it("leaves description out when the decorator gives none", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @correlationId("$message.payload#/orderId")
      model OrderCreated {
        orderId: string;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(messagesOf(doc).OrderCreated.correlationId).toEqual({
      location: "$message.payload#/orderId",
    });
  });

  it("leaves correlationId out of a message that carries no @correlationId", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        orderId: string;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(Object.hasOwn(messagesOf(doc).OrderCreated, "correlationId")).toBe(false);
  });

  // The `#` is required, and the JSON Pointer after it may be empty or name
  // several levels. AsyncAPI's own examples use both forms, so both must
  // survive validation.
  it.each([
    "$message.header#",
    "$message.payload#",
    "$message.header#/",
    "$message.header#/MQMD/CorrelId",
    "$message.payload#/order/id",
    "$message.header#/a~0b",
    "$message.header#/a~1b",
  ])("accepts the legal location '%s'", async (location) => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @correlationId("${location}")
      model OrderCreated {
        orderId: string;
      }
    `);

    expect(diagnosticsWith(diagnostics, "invalid-correlation-id-location")).toHaveLength(0);

    const doc = documentFrom(runner.program);
    expect(messagesOf(doc).OrderCreated.correlationId).toEqual({ location });
  });

  // The bare form without a `#` reads as legal in the prose ABNF, but the
  // normative AsyncAPI JSON Schema requires the `#`. The official parser
  // rejects a document that carries it, so the emitter rejects it first.
  it.each([
    "$message.header",
    "$message.payload",
    "$message.headers#/id",
    "$message.header/id",
    "$message.header#id",
    "message.header#/id",
    "$message.body#/id",
    "",
  ])("reports an error for the illegal location '%s'", async (location) => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @correlationId("${location}")
      model OrderCreated {
        orderId: string;
      }
    `);

    const reported = diagnosticsWith(diagnostics, "invalid-correlation-id-location");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");

    // A location the emitter cannot parse produces no `correlationId` at all.
    const doc = documentFrom(runner.program);
    expect(Object.hasOwn(messagesOf(doc).OrderCreated, "correlationId")).toBe(false);
  });

  // The format is all this emitter checks. AsyncAPI states no requirement
  // that the pointer name a field the schema declares, and its own examples
  // point at paths their schemas never define.
  it("accepts a pointer that names no declared field", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @correlationId("$message.header#/MQMD/CorrelId")
      model OrderCreated {
        @header
        traceId: string;

        orderId: string;
      }
    `);

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    const doc = documentFrom(runner.program);
    expect(messagesOf(doc).OrderCreated.correlationId).toEqual({
      location: "$message.header#/MQMD/CorrelId",
    });
  });

  it("reports an error when @correlationId is applied twice", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @correlationId("$message.header#/first")
      @correlationId("$message.header#/second")
      model OrderCreated {
        orderId: string;
      }
    `);

    const reported = diagnosticsWith(diagnostics, "duplicate-correlation-id-decorator");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");

    // Decorators run bottom-up, so the one written last in the source is the
    // one that reaches the state first, and it keeps the message.
    const doc = documentFrom(runner.program);
    expect(messagesOf(doc).OrderCreated.correlationId).toEqual({
      location: "$message.header#/second",
    });
  });
  it("leaves out a correlation id description that is an empty string", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @correlationId("$message.header#", "")
      model OrderCreated {
        id: string;
      }
    `);

    const doc = documentFrom(runner.program);

    // A blank description says nothing about the correlation id. The emitter
    // leaves the field out rather than claim the description is empty.
    expect(messagesOf(doc).OrderCreated.correlationId).toEqual({
      location: "$message.header#",
    });
  });
});

describe("Unit: single application guard", () => {
  it("reports a duplicate even when the winning application is rejected", async () => {
    // Decorators run bottom-up, so the invalid location runs first. It
    // records nothing. A guard that asked whether a value was stored would
    // read that as "no decorator yet" and let the second one through in
    // silence, leaving the author told about the location and never told
    // they wrote the decorator twice.
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      @AsyncAPI.message
      @AsyncAPI.correlationId("$message.header#/second")
      @AsyncAPI.correlationId("not-a-runtime-expression")
      model M { a: string; }
    `);

    const codes = diagnostics.map((d) => d.code).sort(byCodePoint);
    expect(codes).toEqual([
      "tsp-asyncapi/duplicate-correlation-id-decorator",
      "tsp-asyncapi/invalid-correlation-id-location",
    ]);
  });
});
