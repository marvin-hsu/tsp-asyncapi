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

    // Lifting is local to the message that declares the header. The entry of
    // `OrderCreated` is shared with the payload of `OrderBatch`, so it keeps
    // every field. The lifted field leaves a payload component of its own.
    expect(doc.components?.schemas?.OrderCreated).toEqual({
      type: "object",
      properties: { traceId: { type: "string" }, orderId: { type: "string" } },
      required: ["traceId", "orderId"],
    });
    expect(doc.components?.schemas?.OrderCreatedPayload).toEqual({
      type: "object",
      properties: { orderId: { type: "string" } },
      required: ["orderId"],
    });
    expect(doc.components?.messages?.OrderCreated.payload).toEqual({
      $ref: "#/components/schemas/OrderCreatedPayload",
    });
    expect(doc.components?.messages?.OrderCreated.headers).toEqual({
      type: "object",
      properties: { traceId: { type: "string" } },
      required: ["traceId"],
    });
    // `OrderBatch` lifts nothing, so its payload stays a reference to its own
    // model, and the element type of `orders` is the whole `OrderCreated`.
    expect(doc.components?.messages?.OrderBatch.headers).toBeUndefined();
    expect(doc.components?.messages?.OrderBatch.payload).toEqual({
      $ref: "#/components/schemas/OrderBatch",
    });
    expect(doc.components?.schemas?.OrderBatch).toEqual({
      type: "object",
      properties: {
        orders: { type: "array", items: { $ref: "#/components/schemas/OrderCreated" } },
      },
      required: ["orders"],
    });
    expect(
      runner.program.diagnostics.filter((d) => d.code === "tsp-asyncapi/nested-header-ignored"),
    ).toHaveLength(0);
  });

  it("derives the payload key from the resolved schema key, not the declared name", async () => {
    // The derived key is built from whatever the key registry resolved for
    // the model, so `@friendlyName` and namespace qualification carry into
    // it. Building it from `model.name` instead would emit `EvPayload`
    // here, which no reader could connect to the `Renamed` message.
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Sales;

      @message
      @friendlyName("Renamed")
      model Ev {
        @header
        h: string;

        body: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.components?.messages?.Renamed.payload).toEqual({
      $ref: "#/components/schemas/RenamedPayload",
    });
    expect(doc.components?.schemas?.RenamedPayload).toEqual({
      type: "object",
      properties: { body: { type: "string" } },
      required: ["body"],
    });
    // Nothing else refers to the model, so its own component is not emitted.
    // Only a reachable model reaches `components.schemas`.
    expect(Object.keys(doc.components?.schemas ?? {})).toEqual(["RenamedPayload"]);
  });

  it("keeps the whole shape for a message model nested in another payload", async () => {
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

    // Lifting is local to the message. `Inner` keeps its whole shape for
    // every other reader, and the message points at a payload component of
    // its own instead.
    expect(doc.components?.schemas?.Inner).toEqual({
      type: "object",
      properties: { traceId: { type: "string" }, v: { type: "string" } },
      required: ["traceId", "v"],
    });
    expect(doc.components?.schemas?.InnerPayload).toEqual({
      type: "object",
      properties: { v: { type: "string" } },
      required: ["v"],
    });
    expect(doc.components?.messages?.Inner.payload).toEqual({
      $ref: "#/components/schemas/InnerPayload",
    });
    // `Outer` reaches `Inner` as a field, so it still describes `traceId`.
    expect(doc.components?.schemas?.Outer.properties?.inner).toEqual({
      $ref: "#/components/schemas/Inner",
    });
    // A nested use of a lifting message is ordinary now. Nothing about this
    // shape is worth a diagnostic, and the derived key is free.
    expect(
      runner.program.diagnostics.filter(
        (d) =>
          d.code === "tsp-asyncapi/nested-header-ignored" ||
          d.code === "tsp-asyncapi/duplicate-schema-key",
      ),
    ).toHaveLength(0);
  });

  it("reports a model whose own name collides with a derived payload key", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model InnerPayload {
        x: string;
      }

      @message
      model Outer {
        collides: InnerPayload;
      }

      @message
      model Inner {
        @header
        traceId: string;

        v: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // The derived key goes through the same collision rule as every other
    // schema key. So a model the author named `InnerPayload` is reported
    // rather than silently replaced by the derived payload of `Inner`. The
    // author wrote no second `InnerPayload`, so the report names the message
    // whose payload needs the key.
    const reported = runner.program.diagnostics.filter(
      (d) => d.code === "tsp-asyncapi/payload-schema-key-taken",
    );
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");
    expect(reported[0]?.message).toMatch(/'InnerPayload'/);
    expect(reported[0]?.message).toMatch(/'Inner'/);
    expect(
      runner.program.diagnostics.filter((d) => d.code === "tsp-asyncapi/duplicate-schema-key"),
    ).toHaveLength(0);
    // The author's model keeps the key, so `Outer` still describes its field.
    expect(doc.components?.schemas?.InnerPayload).toEqual({
      type: "object",
      properties: { x: { type: "string" } },
      required: ["x"],
    });
    // The payload has no component to point at, so it is emitted in place.
    // A reference to the model's own component would describe `traceId` as
    // payload data while `headers` describes it as a header.
    expect(doc.components?.messages?.Inner.payload).toEqual({
      type: "object",
      properties: { v: { type: "string" } },
      required: ["v"],
    });
    expect(doc.components?.messages?.Inner.headers).toEqual({
      type: "object",
      properties: { traceId: { type: "string" } },
      required: ["traceId"],
    });
    // Nothing reads the model itself, so it registers no component of its own.
    expect(Object.keys(doc.components?.schemas ?? {}).sort(byCodePoint)).toEqual([
      "InnerPayload",
      "Outer",
    ]);
  });

  it("reports the collision when the lifting message claims the derived key first", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Inner {
        @header
        traceId: string;

        v: string;
      }

      model InnerPayload {
        x: string;
      }

      @message
      model Outer {
        collides: InnerPayload;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // Same clash, reached from the other side. The derived key is claimed
    // before the author's model is built, so the model is the one reported.
    // Either order reports the clash, and either report names the message
    // that needs the derived key, which is the half the author cannot see.
    const reported = runner.program.diagnostics.filter(
      (d) => d.code === "tsp-asyncapi/payload-schema-key-taken",
    );
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");
    expect(reported[0]?.message).toMatch(/'InnerPayload'/);
    expect(reported[0]?.message).toMatch(/'Inner'/);
    expect(
      runner.program.diagnostics.filter((d) => d.code === "tsp-asyncapi/duplicate-schema-key"),
    ).toHaveLength(0);
    // The first claimant keeps the key, the same rule every other schema key
    // collision follows.
    expect(doc.components?.schemas?.InnerPayload).toEqual({
      type: "object",
      properties: { v: { type: "string" } },
      required: ["v"],
    });
    expect(doc.components?.messages?.Inner.payload).toEqual({
      $ref: "#/components/schemas/InnerPayload",
    });
  });

  it("keeps the whole shape for a message model that its own payload graph nests", async () => {
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

    // The payload graph of `Inner` runs through `Wrapper` and back to
    // `Inner`. The arrival is an ordinary schema reference, so the entry it
    // lands on keeps every field, `traceId` included.
    expect(doc.components?.schemas?.Inner).toEqual({
      type: "object",
      properties: {
        traceId: { type: "string" },
        wrapped: { $ref: "#/components/schemas/Wrapper" },
        v: { type: "string" },
      },
      required: ["traceId", "v"],
    });
    expect(doc.components?.schemas?.Wrapper).toEqual({
      type: "object",
      properties: { inner: { $ref: "#/components/schemas/Inner" } },
      required: ["inner"],
    });
    // The payload component drops the lifted field alone. It still reaches
    // the cycle through `wrapped`, which refers to the whole `Inner`.
    expect(doc.components?.schemas?.InnerPayload).toEqual({
      type: "object",
      properties: {
        wrapped: { $ref: "#/components/schemas/Wrapper" },
        v: { type: "string" },
      },
      required: ["v"],
    });
    expect(doc.components?.messages?.Inner.payload).toEqual({
      $ref: "#/components/schemas/InnerPayload",
    });
    expect(doc.components?.messages?.Inner.headers).toEqual({
      type: "object",
      properties: { traceId: { type: "string" } },
      required: ["traceId"],
    });
    // A payload graph that returns to the lifting message is ordinary now.
    expect(
      runner.program.diagnostics.filter(
        (d) =>
          d.code === "tsp-asyncapi/nested-header-ignored" ||
          d.code === "tsp-asyncapi/duplicate-schema-key",
      ),
    ).toHaveLength(0);
  });

  it("keeps the whole shape for a message model that another message uses as its @headers", async () => {
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

    // `B` refers to the one entry of `A`, and that entry keeps `h`. So the
    // headers schema of `B` describes every field the source of `A` does.
    expect(doc.components?.messages?.B.headers).toEqual({ $ref: "#/components/schemas/A" });
    expect(doc.components?.schemas?.A).toEqual({
      type: "object",
      properties: { h: { type: "string" }, body: { type: "string" } },
      required: ["h", "body"],
    });
    // The message `A` still keeps `h` out of its own payload, through a
    // payload component of its own.
    expect(doc.components?.schemas?.APayload).toEqual({
      type: "object",
      properties: { body: { type: "string" } },
      required: ["body"],
    });
    expect(doc.components?.messages?.A.payload).toEqual({
      $ref: "#/components/schemas/APayload",
    });
    // `B` lifts nothing of its own, so its payload stays its own model.
    expect(doc.components?.messages?.B.payload).toEqual({ $ref: "#/components/schemas/B" });
    // Sharing a lifting message as a `@headers` model is ordinary now.
    expect(
      runner.program.diagnostics.filter(
        (d) =>
          d.code === "tsp-asyncapi/nested-header-ignored" ||
          d.code === "tsp-asyncapi/duplicate-schema-key",
      ),
    ).toHaveLength(0);
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

  it("emits a payload component only for the message that lifts a header", async () => {
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // `Inner` lifts a field, so it gets a derived payload component. `Outer`
    // lifts nothing, so its payload stays a reference to its own model and no
    // `OuterPayload` is invented for it.
    expect(Object.keys(doc.components?.schemas ?? {}).sort(byCodePoint)).toEqual([
      "InnerPayload",
      "Outer",
    ]);
    expect(doc.components?.messages?.Inner.payload).toEqual({
      $ref: "#/components/schemas/InnerPayload",
    });
    expect(doc.components?.messages?.Outer.payload).toEqual({
      $ref: "#/components/schemas/Outer",
    });
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
      payload: { $ref: "#/components/schemas/OrderCreatedPayload" },
    });
    expect(doc.components?.schemas?.OrderCreatedPayload).toEqual({
      type: "object",
      properties: { orderId: { type: "string" } },
      required: ["orderId"],
    });
    // A spread leaves no declaration behind, so `Base` emits no component of
    // its own and the payload component is the only schema.
    expect(Object.keys(doc.components?.schemas ?? {})).toEqual(["OrderCreatedPayload"]);
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

    // `Base` lifts `traceId`, and `Derived` inherits the field. A reader of
    // `Derived` expects the specialisation to describe the field where the
    // base message does, so the header is repeated on `Derived`.
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
    // Each message gets a payload component of its own, and each is
    // flattened. An `allOf` branch to `Base` would bring the inherited
    // `traceId` back into the payload of `Derived`.
    expect(doc.components?.schemas?.BasePayload).toEqual({
      type: "object",
      properties: { body: { type: "string" } },
      required: ["body"],
    });
    expect(doc.components?.schemas?.DerivedPayload).toEqual({
      type: "object",
      properties: { extra: { type: "string" }, body: { type: "string" } },
      required: ["extra", "body"],
    });
    expect(doc.components?.messages?.Base.payload).toEqual({
      $ref: "#/components/schemas/BasePayload",
    });
    expect(doc.components?.messages?.Derived.payload).toEqual({
      $ref: "#/components/schemas/DerivedPayload",
    });
    // Neither message model is referenced from anywhere else, so no component
    // is emitted for the models themselves.
    expect(Object.keys(doc.components?.schemas ?? {}).sort(byCodePoint)).toEqual([
      "BasePayload",
      "DerivedPayload",
    ]);
    // The inherited mark is honoured, so neither ignore diagnostic applies.
    expect(
      runner.program.diagnostics.filter(
        (d) =>
          d.code === "tsp-asyncapi/nested-header-ignored" ||
          d.code === "tsp-asyncapi/inherited-header-ignored",
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

  it("reports @discriminator on a message that lifts headers, and drops it from the payload", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @discriminator("kind")
      @message
      model Base {
        @header
        h: string;

        kind: string;
      }

      model Cat extends Base {
        kind: "cat";
        meow: boolean;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // A discriminator on the payload would name the subtype components
    // through its implicit mapping. Those still require the lifted field,
    // which only ever travels in `headers`, so no payload could satisfy the
    // schema. The emitter names the conflict and leaves the keyword off.
    const reported = runner.program.diagnostics.filter(
      (d) => d.code === "tsp-asyncapi/discriminated-lifted-header",
    );
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");
    expect(reported[0]?.message).toMatch(/'Base'/);
    expect(doc.components?.schemas?.BasePayload).toEqual({
      type: "object",
      properties: { kind: { type: "string" } },
      required: ["kind"],
    });
    // A discriminator means nothing without its variants, so the subtypes
    // are emitted too. `Cat` refers to `Base`, so the model's own component
    // is emitted with every field.
    expect(doc.components?.schemas?.Cat).toEqual({
      allOf: [
        { $ref: "#/components/schemas/Base" },
        {
          type: "object",
          properties: { kind: { type: "string", enum: ["cat"] }, meow: { type: "boolean" } },
          required: ["kind", "meow"],
        },
      ],
    });
    expect(doc.components?.schemas?.Base).toEqual({
      type: "object",
      properties: { h: { type: "string" }, kind: { type: "string" } },
      required: ["h", "kind"],
      discriminator: "kind",
    });
    expect(doc.components?.messages?.Base.payload).toEqual({
      $ref: "#/components/schemas/BasePayload",
    });
    // The polymorphism is announced on the model's own component, which every
    // variant refers to, so nothing about the hierarchy is lost.
    expect(
      runner.program.diagnostics.filter(
        (d) =>
          d.code === "tsp-asyncapi/missing-discriminator-property" ||
          d.code === "tsp-asyncapi/optional-discriminator-property",
      ),
    ).toHaveLength(0);
  });

  it("reports a missing discriminator property once for a lifting message", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @discriminator("kind")
      @message
      model Base {
        @header
        h: string;

        body: string;
      }

      @message
      model Outer {
        b: Base;
      }
    `);

    buildAsyncAPIDocument(runner.program, undefined, {});

    // `Outer` pulls in the model's own component, so `@discriminator` is
    // resolved twice for `Base`. One model with one missing property is one
    // mistake, so the user sees one diagnostic.
    expect(
      runner.program.diagnostics.filter(
        (d) => d.code === "tsp-asyncapi/missing-discriminator-property",
      ),
    ).toHaveLength(1);
  });

  it("keeps an inherited indexer on the payload of a lifting message", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model Bag is Record<string>;

      @message
      model M extends Bag {
        @header
        h: string;

        body: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // The payload component is flattened, so it has no branch back to `Bag`.
    // The constraint on the extra properties must be merged in, or the
    // payload would accept any value under any extra key.
    expect(doc.components?.schemas?.MPayload).toEqual({
      type: "object",
      additionalProperties: { type: "string" },
      properties: { body: { type: "string" } },
      required: ["body"],
    });
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

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

  it("reports an encoded name override conflict for a lifting message alone", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model Base {
        @encodedName("application/json", "a")
        x: string;
      }

      @message
      model M extends Base {
        @header
        h: string;

        @encodedName("application/json", "b")
        x: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // The conflict belongs to the model. Nothing else reads `M` here, so the
    // payload component is the only one built. The check must still run, or
    // the payload keeps the derived wire name in silence.
    expect(
      runner.program.diagnostics.filter(
        (d) => d.code === "tsp-asyncapi/encoded-name-override-conflict",
      ),
    ).toHaveLength(1);
    expect(doc.components?.schemas?.MPayload).toEqual({
      type: "object",
      properties: { b: { type: "string" } },
      required: ["b"],
    });
  });

  it("reports an encoded name override conflict once when the model is read twice", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model Base {
        @encodedName("application/json", "a")
        x: string;
      }

      @message
      model M extends Base {
        @header
        h: string;

        @encodedName("application/json", "b")
        x: string;
      }

      @message
      model Outer {
        m: M;
      }
    `);

    buildAsyncAPIDocument(runner.program, undefined, {});

    // `Outer` builds the model's own component and the message builds the
    // payload component. The conflict is one mistake in one model, so the
    // two builds speak once between them.
    expect(
      runner.program.diagnostics.filter(
        (d) => d.code === "tsp-asyncapi/encoded-name-override-conflict",
      ),
    ).toHaveLength(1);
  });

  it("reports a never-typed override once for a lifting message", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model Base {
        x: string;
        y: string;
      }

      @message
      model M extends Base {
        @header
        h: string;

        x: never;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(
      runner.program.diagnostics.filter(
        (d) => d.code === "tsp-asyncapi/never-typed-property-override",
      ),
    ).toHaveLength(1);
    // The payload keeps the inherited field the override left alone, and
    // describes neither the removed one nor the lifted one.
    expect(doc.components?.schemas?.MPayload).toEqual({
      type: "object",
      properties: { y: { type: "string" } },
      required: ["y"],
    });
  });

  it("keeps the sibling subtypes of a discriminated base a lifting message extends", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @discriminator("kind")
      model Base {
        kind: string;
      }

      @message
      model Dog extends Base {
        @header
        h: string;

        kind: "dog";
        bark: string;
      }

      model Cat extends Base {
        kind: "cat";
        meow: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // The payload component is flattened, so it never builds `Base`. A
    // subtype is reachable through the `extends` link alone, so nothing else
    // would ever reach `Cat`. The discriminated hierarchy the author declared
    // must still reach the document.
    expect(Object.keys(doc.components?.schemas ?? {}).sort(byCodePoint)).toEqual([
      "Base",
      "Cat",
      "Dog",
      "DogPayload",
    ]);
    expect(doc.components?.schemas?.Base).toEqual({
      type: "object",
      properties: { kind: { type: "string" } },
      required: ["kind"],
      discriminator: "kind",
    });
    expect(doc.components?.schemas?.Cat).toEqual({
      allOf: [
        { $ref: "#/components/schemas/Base" },
        {
          type: "object",
          properties: { kind: { type: "string", enum: ["cat"] }, meow: { type: "string" } },
          required: ["kind", "meow"],
        },
      ],
    });
    // `Dog` is a variant of the hierarchy, so its own component keeps every
    // field, the lifted one included.
    expect(doc.components?.schemas?.Dog).toEqual({
      allOf: [
        { $ref: "#/components/schemas/Base" },
        {
          type: "object",
          properties: {
            h: { type: "string" },
            kind: { type: "string", enum: ["dog"] },
            bark: { type: "string" },
          },
          required: ["h", "kind", "bark"],
        },
      ],
    });
    // The message is a leaf of the hierarchy, so its payload names no
    // variants and describes the fields that stayed.
    expect(doc.components?.schemas?.DogPayload).toEqual({
      type: "object",
      properties: { kind: { type: "string", enum: ["dog"] }, bark: { type: "string" } },
      required: ["kind", "bark"],
    });
    expect(doc.components?.messages?.Dog.payload).toEqual({
      $ref: "#/components/schemas/DogPayload",
    });
  });

  it("reports a message with @headers that extends a lifting base", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model Hs {
        a: string;
      }

      @message
      model B {
        @header
        h: string;

        body: string;
      }

      @message
      @headers(Hs)
      model D extends B {
        extra: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // `@headers` describes the whole headers object of `D`, so the inherited
    // lift is cancelled and `h` stays in the payload of `D`. The same field is
    // a header of `B`. One field in two roles is a mistake the author cannot
    // see in the emitted document, so the emitter names it.
    const reported = runner.program.diagnostics.filter(
      (d) => d.code === "tsp-asyncapi/inherited-header-overridden",
    );
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("warning");
    expect(reported[0]?.message).toMatch(/'h'/);
    expect(reported[0]?.message).toMatch(/'B'/);
    expect(reported[0]?.message).toMatch(/'D'/);
    // The document itself is unchanged: `D` keeps the `@headers` model the
    // author asked for, and its payload still describes every field.
    expect(doc.components?.messages?.D.headers).toEqual({ $ref: "#/components/schemas/Hs" });
    expect(doc.components?.messages?.D.payload).toEqual({ $ref: "#/components/schemas/D" });
  });

  it("derives the payload key from the resolved schema key, not the model name", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @friendlyName("Renamed")
      @message
      model M {
        @header
        h: string;

        body: string;
      }

      @message
      model Uses {
        m: M;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // `@friendlyName` decides the component key of the model, so the derived
    // payload key must be built from that key. A payload keyed `MPayload`
    // beside a component keyed `Renamed` would name a model the document
    // never mentions.
    expect(doc.components?.schemas?.Renamed).toEqual({
      type: "object",
      properties: { h: { type: "string" }, body: { type: "string" } },
      required: ["h", "body"],
    });
    expect(doc.components?.schemas?.RenamedPayload).toEqual({
      type: "object",
      properties: { body: { type: "string" } },
      required: ["body"],
    });
    expect(Object.keys(doc.components?.schemas ?? {}).sort(byCodePoint)).toEqual([
      "Renamed",
      "RenamedPayload",
      "Uses",
    ]);
    expect(doc.components?.messages?.Renamed.payload).toEqual({
      $ref: "#/components/schemas/RenamedPayload",
    });
  });
});
