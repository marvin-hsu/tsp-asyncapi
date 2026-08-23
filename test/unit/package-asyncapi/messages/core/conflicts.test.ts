import { describe, it, expect, beforeEach } from "vitest";
import { AsyncAPITester } from "#emitter/testing.js";
import { TesterInstance } from "@typespec/compiler/testing";
import { byCodePoint } from "../../../../utils/sort.js";
import { diagnosticsWith } from "../../../../utils/diagnostics.js";
import { documentFrom } from "../../../../utils/test-host.js";

describe("Unit: Messages — decorator conflicts", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  // The other two rules of this step are enforced where the headers are
  // resolved, and their cases live with the header tests. Two sources of one
  // message's headers is `duplicate-message-headers`, an error that picks no
  // winner. A `@header` below the top level of a message model is
  // `nested-header-ignored`, a warning that leaves the field in the payload.
  it("does not report a conflict when a message field is another message", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderLine {
        sku: string;
      }

      @message
      model OrderCreated {
        id: string;
        firstLine: OrderLine;
      }
    `);

    // `@message` registers a model as a message. It does not change what that
    // model is as a schema. So a field typed by a message model is an
    // ordinary schema reference, and reusing a schema is not a mistake.
    expect(diagnostics).toEqual([]);

    const doc = documentFrom(runner.program);

    expect(doc.components?.schemas?.OrderCreated.properties?.firstLine).toEqual({
      $ref: "#/components/schemas/OrderLine",
    });
    // Both models stay messages of their own. No message nests inside another.
    expect(Object.keys(doc.components?.messages ?? {}).sort(byCodePoint)).toEqual([
      "OrderCreated",
      "OrderLine",
    ]);
  });

  it("says nothing about message-level decorators on a model that is not a message", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      model OrderHeaders {
        traceId: string;
      }

      @contentType("application/json")
      @correlationId("$message.header#/traceId")
      @headers(OrderHeaders)
      @messageExample(#{ payload: #{ id: "1" } })
      model NotAMessage {
        id: string;
      }

      @message
      model OrderCreated {
        id: string;
      }
    `);

    const doc = documentFrom(runner.program);

    // The emitter reports nothing about a type it never reaches. A model
    // without `@message` produces no Message Object at all, so the absence
    // of the whole message is the feedback. This is the same policy the
    // `@header` mark on an unreachable model follows.
    expect(diagnostics).toEqual([]);
    expect(runner.program.diagnostics).toEqual([]);
    expect(Object.keys(doc.components?.messages ?? {})).toEqual(["OrderCreated"]);
  });

  it("reports the tag conflict of a message that a duplicate key drops", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @friendlyName("Shared")
      @message
      model A {
        a: string;
      }

      @friendlyName("Shared")
      @message
      @asyncTag("orders", #{ description: "The first description." })
      @asyncTag("orders", #{ description: "The second description." })
      model B {
        b: string;
      }
    `);

    documentFrom(runner.program);

    // The key collision drops `B`, but the conflict inside `B` is a separate
    // mistake. Reporting it only after the collision is fixed would hand the
    // user one error at a time.
    expect(diagnosticsWith(runner.program.diagnostics, "duplicate-message-key")).toHaveLength(1);
    const reported = diagnosticsWith(runner.program.diagnostics, "conflicting-tag-metadata");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.message).toMatch(/'description'/);
  });
});
