import { describe, it, expect, beforeEach } from "vitest";
import { AsyncAPITester } from "#emitter/testing.js";
import { TesterInstance } from "@typespec/compiler/testing";
import { byCodePoint } from "../../../../utils/sort.js";
import { diagnosticsWith } from "../../../../utils/diagnostics.js";
import { documentFrom } from "../../../../utils/test-host.js";

describe("Unit: Message headers: the derived payload component (Phase 3.3)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
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

    const doc = documentFrom(runner.program);

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
    expect(diagnosticsWith(runner.program.diagnostics, "nested-header-ignored")).toHaveLength(0);
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

    const doc = documentFrom(runner.program);

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

    const doc = documentFrom(runner.program);

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

    const doc = documentFrom(runner.program);

    // The derived key goes through the same collision rule as every other
    // schema key. So a model the author named `InnerPayload` is reported
    // rather than silently replaced by the derived payload of `Inner`. The
    // author wrote no second `InnerPayload`, so the report names the message
    // whose payload needs the key.
    const reported = diagnosticsWith(runner.program.diagnostics, "payload-schema-key-taken");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");
    expect(reported[0]?.message).toMatch(/'InnerPayload'/);
    expect(reported[0]?.message).toMatch(/'Inner'/);
    expect(diagnosticsWith(runner.program.diagnostics, "duplicate-schema-key")).toHaveLength(0);
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

    const doc = documentFrom(runner.program);

    // Same clash, reached from the other side. The derived key is claimed
    // before the author's model is built, so the model is the one reported.
    // Either order reports the clash, and either report names the message
    // that needs the derived key, which is the half the author cannot see.
    const reported = diagnosticsWith(runner.program.diagnostics, "payload-schema-key-taken");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");
    expect(reported[0]?.message).toMatch(/'InnerPayload'/);
    expect(reported[0]?.message).toMatch(/'Inner'/);
    expect(diagnosticsWith(runner.program.diagnostics, "duplicate-schema-key")).toHaveLength(0);
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

    const doc = documentFrom(runner.program);

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

    const doc = documentFrom(runner.program);

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

    const doc = documentFrom(runner.program);

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

    const doc = documentFrom(runner.program);

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
