import { describe, it, expect, beforeEach } from "vitest";
import { AsyncAPITester } from "#emitter/testing.js";
import { TesterInstance } from "@typespec/compiler/testing";
import { getSourceLocation } from "@typespec/compiler";
import { diagnosticsWith } from "../../../utils/diagnostics.js";
import { documentFrom } from "../../../utils/test-host.js";

describe("Unit: Message examples (Phase 3.5)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("emits one example that carries both headers and payload", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @messageExample(
        #{
          headers: #{ correlationId: "abc-123" },
          payload: #{ orderId: "o-1", total: 12.5, paid: true }
        },
        #{ name: "simpleOrder", summary: "One paid order." }
      )
      model OrderCreated {
        @header
        correlationId: string;

        orderId: string;
        total: float64;
        paid: boolean;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(doc.components?.messages?.OrderCreated.examples).toEqual([
      {
        name: "simpleOrder",
        summary: "One paid order.",
        headers: { correlationId: "abc-123" },
        payload: { orderId: "o-1", total: 12.5, paid: true },
      },
    ]);
  });

  it("stacks several named examples on one message, in source order", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @messageExample(#{ payload: #{ orderId: "o-1" } }, #{ name: "first" })
      @messageExample(#{ payload: #{ orderId: "o-2" } }, #{ name: "second", summary: "A retry." })
      @messageExample(#{ headers: #{ traceId: "t-3" } }, #{ name: "third" })
      model OrderCreated {
        @header
        traceId?: string;

        orderId?: string;
      }
    `);

    const doc = await documentFrom(runner.program);

    // AsyncAPI's `examples` is an array, so every application contributes its
    // own entry. Decorators run bottom-up, so this also asserts that the
    // emitter puts the applications back into source order.
    expect(doc.components?.messages?.OrderCreated.examples).toEqual([
      { name: "first", payload: { orderId: "o-1" } },
      { name: "second", summary: "A retry.", payload: { orderId: "o-2" } },
      { name: "third", headers: { traceId: "t-3" } },
    ]);
  });

  it("keeps an example that gives only a payload, and one that gives only headers", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @messageExample(#{ payload: #{ orderId: "o-1" } })
      @messageExample(#{ headers: #{ traceId: "t-1" } })
      model OrderCreated {
        @header
        traceId?: string;

        orderId?: string;
      }
    `);

    const doc = await documentFrom(runner.program);

    // A field with nothing to say is left out. An example with no `name` does
    // not emit an empty one.
    expect(doc.components?.messages?.OrderCreated.examples).toEqual([
      { payload: { orderId: "o-1" } },
      { headers: { traceId: "t-1" } },
    ]);
  });

  it("leaves examples out of a message that carries no @messageExample", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        orderId: string;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(Object.hasOwn(doc.components?.messages?.OrderCreated ?? {}, "examples")).toBe(false);
  });

  it("emits a nested and an array example value as written", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model OrderItem {
        productId: string;
        quantity: int32;
      }

      @message
      @messageExample(#{
        payload: #{
          orderId: "o-1",
          items: #[#{ productId: "p-1", quantity: 2 }, #{ productId: "p-2", quantity: 1 }]
        }
      })
      model OrderCreated {
        orderId: string;
        items: OrderItem[];
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(doc.components?.messages?.OrderCreated.examples).toEqual([
      {
        payload: {
          orderId: "o-1",
          items: [
            { productId: "p-1", quantity: 2 },
            { productId: "p-2", quantity: 1 },
          ],
        },
      },
    ]);
  });

  it("serializes a date-time example value as a string", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @messageExample(#{ payload: #{ placedAt: utcDateTime.fromISO("2026-08-15T09:30:00Z") } })
      model OrderCreated {
        placedAt: utcDateTime;
      }
    `);

    const doc = await documentFrom(runner.program);

    // The raw TypeSpec value keeps the scalar's type, so the emitter writes
    // the ISO form rather than the compiler's internal value object.
    expect(doc.components?.messages?.OrderCreated.examples).toEqual([
      { payload: { placedAt: "2026-08-15T09:30:00Z" } },
    ]);
  });

  it("drops an example whose value cannot be serialized, and reports it", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      scalar ipv4 extends string {
        init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
      }

      @message
      @messageExample(#{ payload: #{ source: ipv4.fromBytes(1, 2, 3, 4), orderId: "o-1" } })
      @messageExample(#{ payload: #{ orderId: "o-2" } }, #{ name: "kept" })
      model OrderCreated {
        source: ipv4;
        orderId: string;
      }
    `);

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    // The whole entry goes, including its serializable sibling field. An
    // entry that kept only half of its payload would show a message the
    // application never sends. The other example stays.
    const doc = await documentFrom(runner.program);
    expect(doc.components?.messages?.OrderCreated.examples).toEqual([
      { name: "kept", payload: { orderId: "o-2" } },
    ]);

    // The builder reports while it emits, so the diagnostic lands on the
    // program rather than in the compile result above.
    const reported = diagnosticsWith(runner.program.diagnostics, "unserializable-message-example");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("warning");
  });

  it("reports an error for an example that carries neither headers nor payload", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @messageExample(#{}, #{ name: "empty" })
      model OrderCreated {
        orderId: string;
      }
    `);

    const reported = diagnosticsWith(diagnostics, "empty-message-example");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");

    // The rejected example reaches no document at all.
    const doc = await documentFrom(runner.program);
    expect(Object.hasOwn(doc.components?.messages?.OrderCreated ?? {}, "examples")).toBe(false);
  });

  it("reports a rejected example against its own application", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @messageExample(#{ payload: #{ a: "1" } }, #{ name: "one" })
      @messageExample(#{}, #{ name: "bad" })
      @messageExample(#{ payload: #{ a: "3" } }, #{ name: "three" })
      model M {
        a: string;
      }
    `);

    const reported = diagnosticsWith(diagnostics, "empty-message-example");
    expect(reported).toHaveLength(1);

    // The model carries three applications, so a diagnostic on the model
    // itself does not tell the user which one was rejected. The squiggle
    // covers the application instead.
    const location = getSourceLocation(reported[0]?.target);
    expect(location?.file.text.slice(location.pos, location.pos + 15)).toBe("@messageExample");
    expect(location?.file.text.slice(location.pos, location.end)).toMatch(/"bad"/);
  });

  it("reports an unserializable example against its own application", async () => {
    await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      scalar ipv4 extends string {
        init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
      }

      @message
      @messageExample(#{ payload: #{ orderId: "o-2" } }, #{ name: "kept" })
      @messageExample(#{ payload: #{ source: ipv4.fromBytes(1, 2, 3, 4) } }, #{ name: "bad" })
      model OrderCreated {
        source?: ipv4;
        orderId?: string;
      }
    `);

    await documentFrom(runner.program);

    const reported = diagnosticsWith(runner.program.diagnostics, "unserializable-message-example");
    expect(reported).toHaveLength(1);
    const location = getSourceLocation(reported[0]?.target);
    expect(location?.file.text.slice(location.pos, location.pos + 15)).toBe("@messageExample");
    expect(location?.file.text.slice(location.pos, location.end)).toMatch(/"bad"/);
  });

  it("keeps the other examples when one of them is empty", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @messageExample(#{ payload: #{ orderId: "o-1" } }, #{ name: "kept" })
      @messageExample(#{}, #{ name: "empty" })
      model OrderCreated {
        orderId: string;
      }
    `);

    expect(diagnosticsWith(diagnostics, "empty-message-example")).toHaveLength(1);

    const doc = await documentFrom(runner.program);
    expect(doc.components?.messages?.OrderCreated.examples).toEqual([
      { name: "kept", payload: { orderId: "o-1" } },
    ]);
  });
  it("rejects an example whose headers are not a key/value map", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @messageExample(#{ headers: "not-a-map", payload: #{ orderId: "o-1" } })
      model OrderCreated {
        orderId: string;
      }
    `);

    // The AsyncAPI Message Example Object types `headers` as a map, and the
    // official parser rejects any other shape. The decorator parameter says
    // so, so the compiler stops the value before it reaches the document.
    const reported = diagnostics.filter((d) => d.code === "invalid-argument");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");

    const doc = await documentFrom(runner.program);
    expect(Object.hasOwn(doc.components?.messages?.OrderCreated ?? {}, "examples")).toBe(false);
  });

  it("accepts a scalar payload, which the specification types as any", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @messageExample(#{ payload: "o-1" })
      model OrderCreated {
        orderId: string;
      }
    `);

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    const doc = await documentFrom(runner.program);
    expect(doc.components?.messages?.OrderCreated.examples).toEqual([{ payload: "o-1" }]);
  });
  it("leaves out example metadata that is an empty string", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @messageExample(#{ payload: #{ orderId: "o-1" } }, #{ name: "", summary: "" })
      model OrderCreated {
        orderId: string;
      }
    `);

    const doc = await documentFrom(runner.program);

    // A blank name names nothing and a blank summary summarises nothing. Both
    // fields are left out, the same rule every other prose field follows.
    expect(doc.components?.messages?.OrderCreated.examples).toEqual([
      { payload: { orderId: "o-1" } },
    ]);
  });
});
