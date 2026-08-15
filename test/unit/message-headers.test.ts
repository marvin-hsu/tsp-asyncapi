import { describe, it, expect, beforeEach } from "vitest";
import { AsyncAPITester } from "../../src/testing/index.js";
import { TesterInstance } from "@typespec/compiler/testing";
import { buildAsyncAPIDocument } from "../../src/builders/document.js";
import { byCodePoint } from "../utils/sort.js";

describe("Unit: Message headers (Phase 3.3)", () => {
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

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
      payload: { $ref: "#/components/schemas/OrderCreated" },
    });
    // The payload keeps the non-header fields, and only those.
    expect(doc.components?.schemas?.OrderCreated).toEqual({
      type: "object",
      properties: {
        orderId: { type: "string" },
        total: { type: "number", format: "double" },
      },
      required: ["orderId", "total"],
    });
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.components?.schemas?.Ping).toEqual({ type: "object" });
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.components?.messages?.OrderCreated).toEqual({
      name: "OrderCreated",
      payload: { $ref: "#/components/schemas/OrderCreated" },
    });
    expect(Object.hasOwn(doc.components?.messages?.OrderCreated ?? {}, "headers")).toBe(false);
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const diagnostic = runner.program.diagnostics.find(
      (d) => d.code === "tsp-asyncapi/duplicate-message-headers",
    );
    expect(diagnostic?.severity).toBe("error");
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
    expect(
      runner.program.diagnostics.filter((d) => d.code === "tsp-asyncapi/nested-header-ignored"),
    ).toHaveLength(0);
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const diagnostics = runner.program.diagnostics.filter(
      (d) => d.code === "tsp-asyncapi/nested-header-ignored",
    );
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

  it("lifts a header of a message model that another message refers to", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        @header
        traceId: string;

        orderId: string;
      }

      @message
      model OrderBatch {
        orders: OrderCreated[];
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // Both messages share one schema, so the lifted field leaves it once and
    // for all. It is a header of that message wherever the message is used.
    expect(doc.components?.schemas?.OrderCreated).toEqual({
      type: "object",
      properties: { orderId: { type: "string" } },
      required: ["orderId"],
    });
    expect(doc.components?.messages?.OrderCreated.headers).toEqual({
      type: "object",
      properties: { traceId: { type: "string" } },
      required: ["traceId"],
    });
    expect(doc.components?.messages?.OrderBatch.headers).toBeUndefined();
    expect(
      runner.program.diagnostics.filter((d) => d.code === "tsp-asyncapi/nested-header-ignored"),
    ).toHaveLength(0);
    // The shared entry no longer describes the lifted field, so the nested
    // use in `OrderBatch` lost it too. That is reported.
    const shared = runner.program.diagnostics.filter(
      (d) => d.code === "tsp-asyncapi/shared-lifted-header",
    );
    expect(shared).toHaveLength(1);
    expect(shared[0]?.severity).toBe("warning");
  });

  it("reports a lifted header on a message model nested in another payload", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Inner {
        @header
        traceId: string;

        v: string;
      }

      @message
      model Outer {
        inner: Inner;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const reported = runner.program.diagnostics.filter(
      (d) => d.code === "tsp-asyncapi/shared-lifted-header",
    );
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("warning");
    expect(reported[0]?.message).toMatch(/'Inner'/);

    // The one shared entry describes the payload of `Inner` alone, so
    // `Outer` no longer describes `traceId` at that position either. The
    // warning above is what tells the user.
    expect(doc.components?.schemas?.Inner).toEqual({
      type: "object",
      properties: { v: { type: "string" } },
      required: ["v"],
    });
  });

  it("reports a lifted header on a message model that its own payload graph nests", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model Wrapper {
        inner: Inner;
      }

      @message
      model Inner {
        @header
        traceId: string;

        wrapped?: Wrapper;
        v: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const reported = runner.program.diagnostics.filter(
      (d) => d.code === "tsp-asyncapi/shared-lifted-header",
    );
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("warning");
    expect(reported[0]?.message).toMatch(/'Inner'/);

    // The path back to `Inner` runs through `Wrapper`, so the nested use is
    // the same silent loss the acyclic case has. `Wrapper.inner` refers to
    // the one entry, and that entry no longer describes `traceId`.
    expect(doc.components?.schemas?.Inner.properties?.traceId).toBeUndefined();
    expect(doc.components?.schemas?.Wrapper.properties?.inner).toEqual({
      $ref: "#/components/schemas/Inner",
    });
  });

  it("reports a lifted header on a message model that another message uses as its @headers", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model A {
        @header
        h: string;

        body: string;
      }

      @message
      @headers(A)
      model B {
        x: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const reported = runner.program.diagnostics.filter(
      (d) => d.code === "tsp-asyncapi/shared-lifted-header",
    );
    expect(reported).toHaveLength(1);
    expect(reported[0]?.message).toMatch(/'A'/);

    // `B` refers to the one entry of `A`, and that entry lost `h` to the
    // lifting. So the headers schema of `B` describes fewer fields than the
    // source of `A` does.
    expect(doc.components?.messages?.B.headers).toEqual({ $ref: "#/components/schemas/A" });
    expect(doc.components?.schemas?.A.properties?.h).toBeUndefined();
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

  it("does not report a shared lifted header when no other payload nests the message", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Inner {
        @header
        traceId: string;

        v: string;
      }

      @message
      model Outer {
        v: string;
      }
    `);

    buildAsyncAPIDocument(runner.program, undefined, {});

    expect(
      runner.program.diagnostics.filter((d) => d.code === "tsp-asyncapi/shared-lifted-header"),
    ).toHaveLength(0);
  });

  it("reports an inherited @header rather than a nested one", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model Base {
        @header
        traceId: string;
      }

      @message
      model OrderCreated extends Base {
        orderId: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const reported = runner.program.diagnostics.filter(
      (d) => d.code === "tsp-asyncapi/inherited-header-ignored",
    );
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("warning");
    expect(reported[0]?.message).toMatch(/'OrderCreated'/);
    // The ordinary nested message would send the user to a fix that does not
    // apply, so it must not fire here.
    expect(
      runner.program.diagnostics.filter((d) => d.code === "tsp-asyncapi/nested-header-ignored"),
    ).toHaveLength(0);

    // Nothing is lifted. The base model is a declaration of its own, and the
    // payload refers to it through `allOf`.
    expect(doc.components?.messages?.OrderCreated).toEqual({
      name: "OrderCreated",
      payload: { $ref: "#/components/schemas/OrderCreated" },
    });
    expect(doc.components?.schemas?.Base).toEqual({
      type: "object",
      properties: { traceId: { type: "string" } },
      required: ["traceId"],
    });
  });

  it("lifts a @header that a message spreads in from another model", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model Base {
        @header
        traceId: string;
      }

      @message
      model OrderCreated {
        ...Base;

        orderId: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // A spread copies the property into the message model, so it is the
    // message's own top-level field and it is lifted. This is the half of the
    // rule the `extends` case above does not reach.
    expect(doc.components?.messages?.OrderCreated).toEqual({
      name: "OrderCreated",
      headers: {
        type: "object",
        properties: { traceId: { type: "string" } },
        required: ["traceId"],
      },
      payload: { $ref: "#/components/schemas/OrderCreated" },
    });
    expect(doc.components?.schemas?.OrderCreated).toEqual({
      type: "object",
      properties: { orderId: { type: "string" } },
      required: ["orderId"],
    });
    expect(
      runner.program.diagnostics.filter(
        (d) =>
          d.code === "tsp-asyncapi/nested-header-ignored" ||
          d.code === "tsp-asyncapi/inherited-header-ignored",
      ),
    ).toHaveLength(0);
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

    buildAsyncAPIDocument(runner.program, undefined, {});

    // The ambiguity is the same on both headers mechanisms, so the check
    // covers the @headers model too.
    const reported = runner.program.diagnostics.filter(
      (d) => d.code === "tsp-asyncapi/content-type-header-conflict",
    );
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

    buildAsyncAPIDocument(runner.program, undefined, {});

    const reported = runner.program.diagnostics.filter(
      (d) => d.code === "tsp-asyncapi/content-type-header-conflict",
    );
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

    buildAsyncAPIDocument(runner.program, undefined, {});

    expect(
      runner.program.diagnostics.filter(
        (d) => d.code === "tsp-asyncapi/content-type-header-conflict",
      ),
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const diagnostics = runner.program.diagnostics.filter(
      (d) => d.code === "tsp-asyncapi/content-type-header-conflict",
    );
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(
      runner.program.diagnostics.filter(
        (d) => d.code === "tsp-asyncapi/content-type-header-conflict",
      ),
    ).toHaveLength(0);
    expect(doc.components?.messages?.OrderCreated.headers).toEqual({
      type: "object",
      properties: { "content-type": { type: "string" } },
      required: ["content-type"],
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

    buildAsyncAPIDocument(runner.program, undefined, {});

    expect(
      runner.program.diagnostics.filter((d) => d.code === "tsp-asyncapi/nested-header-ignored"),
    ).toHaveLength(0);
  });

  it("lifts an inherited @header when the base model is itself a lifting message", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Base {
        @header
        traceId: string;

        body: string;
      }

      @message
      model Derived extends Base {
        extra: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // `Base` lifts `traceId`, so the one `components.schemas.Base` entry no
    // longer describes it. `Derived` refers to that entry through `allOf`, so
    // its payload cannot describe the field either. The field therefore has
    // to appear in the headers of `Derived` as well. Otherwise the document
    // describes it nowhere for that message.
    expect(doc.components?.messages?.Derived.headers).toEqual({
      type: "object",
      properties: { traceId: { type: "string" } },
      required: ["traceId"],
    });
    expect(doc.components?.messages?.Base.headers).toEqual({
      type: "object",
      properties: { traceId: { type: "string" } },
      required: ["traceId"],
    });
    // The inherited mark is honoured, so neither ignore diagnostic applies.
    expect(
      runner.program.diagnostics.filter(
        (d) =>
          d.code === "tsp-asyncapi/nested-header-ignored" ||
          d.code === "tsp-asyncapi/inherited-header-ignored" ||
          d.code === "tsp-asyncapi/shared-lifted-header",
      ),
    ).toHaveLength(0);
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

    buildAsyncAPIDocument(runner.program, undefined, {});

    // The derived message adopts the header its base already lifts. The
    // conflict is about one property, so it is reported once. The message
    // text names no message, so a second report would be the same text on the
    // same squiggle.
    expect(
      runner.program.diagnostics.filter(
        (d) => d.code === "tsp-asyncapi/content-type-header-conflict",
      ),
    ).toHaveLength(1);
  });
});
