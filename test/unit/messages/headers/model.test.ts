import { describe, it, expect, beforeEach } from "vitest";
import { AsyncAPITester } from "../../../../src/testing/index.js";
import { TesterInstance } from "@typespec/compiler/testing";
import { buildAsyncAPIDocument } from "../../../../src/builders/document.js";
import { byCodePoint } from "../../../utils/sort.js";

describe("Unit: Message headers: the @headers model (Phase 3.3)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });
  it("refs a separate headers model given to @headers", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model MessageHeaders {
        MQMD: MqmdFields;
      }

      model MqmdFields {
        CorrelId: string;
      }

      @message
      @headers(MessageHeaders)
      model OrderCreated {
        orderId: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.components?.messages?.OrderCreated).toEqual({
      name: "OrderCreated",
      headers: { $ref: "#/components/schemas/MessageHeaders" },
      payload: { $ref: "#/components/schemas/OrderCreated" },
    });
    // The headers model is collected like any other reachable model, and it
    // keeps its nested shape.
    expect(Object.keys(doc.components?.schemas ?? {}).sort(byCodePoint)).toEqual([
      "MessageHeaders",
      "MqmdFields",
      "OrderCreated",
    ]);
    expect(doc.components?.schemas?.MessageHeaders).toEqual({
      type: "object",
      properties: { MQMD: { $ref: "#/components/schemas/MqmdFields" } },
      required: ["MQMD"],
    });
    // A headers model does not touch the payload.
    expect(doc.components?.schemas?.OrderCreated).toEqual({
      type: "object",
      properties: { orderId: { type: "string" } },
      required: ["orderId"],
    });
  });

  it("inlines an anonymous model given to @headers", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @headers({ traceId: string })
      model OrderCreated {
        orderId: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.components?.messages?.OrderCreated.headers).toEqual({
      type: "object",
      properties: { traceId: { type: "string" } },
      required: ["traceId"],
    });
  });

  it("reports an error when the model given to @headers is not an object", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      model HeaderList is string[];

      @message
      @headers(HeaderList)
      model OrderCreated {
        orderId: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const diagnostic = [...diagnostics, ...runner.program.diagnostics].find(
      (d) => d.code === "tsp-asyncapi/headers-not-object",
    );
    expect(diagnostic?.severity).toBe("error");
    expect(String(diagnostic?.message)).toMatch(/'HeaderList'/);
    expect(doc.components?.messages?.OrderCreated).toEqual({
      name: "OrderCreated",
      payload: { $ref: "#/components/schemas/OrderCreated" },
    });
  });

  it("leaves a @header inside a @headers model alone", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model OrderHeaders {
        @header
        traceId: string;

        retryCount?: int32;
      }

      @message
      @headers(OrderHeaders)
      model OrderCreated {
        orderId: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // Every field of a `@headers` model is already a header. So the mark
    // there neither adds nor removes a field, and it is not a misplaced one.
    expect(
      runner.program.diagnostics.filter(
        (d) =>
          d.code === "tsp-asyncapi/nested-header-ignored" ||
          d.code === "tsp-asyncapi/inherited-header-ignored",
      ),
    ).toHaveLength(0);
    expect(doc.components?.schemas?.OrderHeaders).toEqual({
      type: "object",
      properties: { traceId: { type: "string" }, retryCount: { type: "integer", format: "int32" } },
      required: ["traceId"],
    });
  });

  it("reports an error when @headers is applied twice to one model", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      model First {
        a: string;
      }

      model Second {
        b: string;
      }

      @message
      @headers(First)
      @headers(Second)
      model OrderCreated {
        orderId: string;
      }
    `);

    const diagnostic = diagnostics.find(
      (d) => d.code === "tsp-asyncapi/duplicate-headers-decorator",
    );
    expect(diagnostic?.severity).toBe("error");

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    // The first application to run keeps the model. Decorators run
    // bottom-up, so that is the one written last.
    expect(doc.components?.messages?.OrderCreated.headers).toEqual({
      $ref: "#/components/schemas/Second",
    });
  });
});
