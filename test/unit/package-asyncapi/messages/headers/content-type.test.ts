import { describe, it, expect, beforeEach } from "vitest";
import { AsyncAPITester } from "#emitter/testing.js";
import { TesterInstance } from "@typespec/compiler/testing";
import { diagnosticsWith } from "../../../../utils/diagnostics.js";
import { documentFrom } from "../../../../utils/test-host.js";

describe("Unit: Message headers: content type (Phase 3.3)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });
  it("reports a content-type property of a @headers model against @contentType", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model MessageHeaders {
        \`content-type\`: string;
      }

      @message
      @contentType("application/json")
      @headers(MessageHeaders)
      model OrderCreated {
        orderId: string;
      }
    `);

    await documentFrom(runner.program);

    // The ambiguity is the same on both headers mechanisms, so the check
    // covers the @headers model too.
    const reported = diagnosticsWith(runner.program.diagnostics, "content-type-header-conflict");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");
    expect(reported[0]?.message).toMatch(/'content-type'/);
  });

  it("reports an inherited content-type property of a @headers model", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model BaseHeaders {
        @encodedName("application/json", "Content-Type")
        contentTypeHeader: string;
      }

      model MessageHeaders extends BaseHeaders {
        traceId: string;
      }

      @message
      @contentType("application/json")
      @headers(MessageHeaders)
      model OrderCreated {
        orderId: string;
      }
    `);

    await documentFrom(runner.program);

    const reported = diagnosticsWith(runner.program.diagnostics, "content-type-header-conflict");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");
  });

  it("does not report a content-type property of a @headers model without @contentType", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model MessageHeaders {
        \`content-type\`: string;
      }

      @message
      @headers(MessageHeaders)
      model OrderCreated {
        orderId: string;
      }
    `);

    await documentFrom(runner.program);

    expect(
      diagnosticsWith(runner.program.diagnostics, "content-type-header-conflict"),
    ).toHaveLength(0);
  });

  it("reports an error when a content-type header meets @contentType", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @contentType("application/json")
      model OrderCreated {
        @header
        @encodedName("application/json", "Content-Type")
        contentTypeHeader: string;

        @header
        traceId: string;

        orderId: string;
      }
    `);

    const doc = await documentFrom(runner.program);

    const diagnostics = diagnosticsWith(runner.program.diagnostics, "content-type-header-conflict");
    // Only the field that names the content type is reported. A header that
    // sits beside it is untouched, and still reaches the headers schema.
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe("error");
    expect(diagnostics[0]?.message ?? "").toMatch(/'Content-Type'/);
    expect(doc.components?.messages?.OrderCreated.headers).toEqual({
      type: "object",
      properties: {
        "Content-Type": { type: "string" },
        traceId: { type: "string" },
      },
      required: ["Content-Type", "traceId"],
    });
  });

  it("keeps a content-type header when the message has no @contentType", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        @header
        @encodedName("application/json", "content-type")
        contentTypeHeader: string;

        orderId: string;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(
      diagnosticsWith(runner.program.diagnostics, "content-type-header-conflict"),
    ).toHaveLength(0);
    expect(doc.components?.messages?.OrderCreated.headers).toEqual({
      type: "object",
      properties: { "content-type": { type: "string" } },
      required: ["content-type"],
    });
  });

  it("reports one content type header conflict for a message that extends a lifting base", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @contentType("application/json")
      model Base {
        @header
        @encodedName("application/json", "content-type")
        ct: string;

        body: string;
      }

      @message
      @contentType("application/json")
      model Derived extends Base {
        extra: string;
      }
    `);

    await documentFrom(runner.program);

    // The derived message adopts the header its base already lifts. The
    // conflict is about one property, so it is reported once. The message
    // text names no message, so a second report would be the same text on the
    // same squiggle.
    expect(
      diagnosticsWith(runner.program.diagnostics, "content-type-header-conflict"),
    ).toHaveLength(1);
  });
});
