import { describe, it, expect, beforeEach } from "vitest";
import { AsyncAPITester } from "#emitter/testing.js";
import { TesterInstance } from "@typespec/compiler/testing";
import { diagnosticsWith } from "../../../../utils/diagnostics.js";
import { documentFrom } from "../../../../utils/test-host.js";

describe("Unit: Messages — description fields", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("emits every description field a message declares", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message("order.created")
      @summary("Order created")
      @doc("Emitted once an order is accepted.")
      @contentType("application/avro")
      model OrderCreated {
        id: string;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(doc.components?.messages?.["order.created"]).toEqual({
      name: "order.created",
      title: "Order created",
      description: "Emitted once an order is accepted.",
      contentType: "application/avro",
      payload: { $ref: "#/components/schemas/OrderCreated" },
    });
  });

  it("leaves out every description field the message does not declare", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }
    `);

    const doc = await documentFrom(runner.program);

    const message = doc.components?.messages?.OrderCreated ?? {};
    // A field with no source is absent, not present and empty.
    // `@summary` fills `title`, and `@doc` fills `description`.
    // There is no third source of prose, so the emitter never writes `summary`.
    expect(Object.keys(message)).toEqual(["name", "payload"]);
    expect("summary" in message).toBe(false);
  });

  it("reports an error when @contentType is applied twice to one model", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @contentType("application/json")
      @contentType("application/avro")
      model OrderCreated {
        id: string;
      }
    `);

    const reported = diagnosticsWith(diagnostics, "duplicate-content-type-decorator");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");

    // Decorators run bottom-up, so the one written last runs first and
    // keeps the message. @message, @headers, and @correlationId keep the same winner.
    const doc = await documentFrom(runner.program);
    expect(doc.components?.messages?.OrderCreated.contentType).toBe("application/avro");
  });

  it("reports an error for an empty @contentType", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @contentType("")
      model OrderCreated {
        id: string;
      }
    `);

    const reported = diagnosticsWith(diagnostics, "empty-content-type");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");

    // The message falls back to the document `defaultContentType`. The user
    // typed the empty string, so that fallback must not be silent.
    const doc = await documentFrom(runner.program);
    expect(Object.hasOwn(doc.components?.messages?.OrderCreated ?? {}, "contentType")).toBe(false);
  });

  it("reports a duplicate @contentType even when the winning value is empty", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @contentType("application/json")
      @contentType("")
      model OrderCreated {
        id: string;
      }
    `);

    // The empty value is written last, so it runs first and wins, but is
    // rejected. No content type reaches the document. The duplicate is still
    // reported, so the first-written value cannot silently win instead.
    expect(diagnosticsWith(diagnostics, "empty-content-type")).toHaveLength(1);
    expect(diagnosticsWith(diagnostics, "duplicate-content-type-decorator")).toHaveLength(1);

    const doc = await documentFrom(runner.program);
    expect(Object.hasOwn(doc.components?.messages?.OrderCreated ?? {}, "contentType")).toBe(false);
  });

  it("does not report a content type conflict for an empty @contentType", async () => {
    await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @contentType("")
      model OrderCreated {
        @header
        @encodedName("application/json", "content-type")
        ct: string;

        id: string;
      }
    `);

    await documentFrom(runner.program);

    // The empty value never reaches the document, so only it is reported.
    // The header check runs while headers are planned, so its diagnostic
    // lands on the program, not in the compile result.
    expect(
      diagnosticsWith(runner.program.diagnostics, "content-type-header-conflict"),
    ).toHaveLength(0);
    expect(diagnosticsWith(runner.program.diagnostics, "empty-content-type")).toHaveLength(1);
  });
});
