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
    // A field with no source is absent, rather than present and empty.
    // AsyncAPI's `summary` has no TypeSpec source at all: `@summary` fills
    // `title` and `@doc` fills `description`, and there is no third source of
    // prose. So the emitter never writes it, and `MessageObject` does not
    // declare it.
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

    // Decorators run bottom-up, so the one written last in the source is the
    // one that reaches the state first, and it keeps the message. This is the
    // same winner @message, @headers, and @correlationId keep.
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

    // The empty value is written last in the source, so it runs first and it
    // is the winner. It is rejected, so no content type reaches the document.
    // The second application is still a second application, so it is
    // reported. Otherwise the value written first in the source would win,
    // the opposite of the rule every sibling decorator follows.
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

    // The empty value never reaches the document, so it is not a second
    // source of the content type. Only the empty value itself is reported.
    // The header check runs while the headers are planned, so its diagnostic
    // lands on the program rather than in the compile result.
    expect(
      diagnosticsWith(runner.program.diagnostics, "content-type-header-conflict"),
    ).toHaveLength(0);
    expect(diagnosticsWith(runner.program.diagnostics, "empty-content-type")).toHaveLength(1);
  });
});
