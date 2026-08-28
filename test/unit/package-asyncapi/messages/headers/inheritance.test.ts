import { describe, it, expect, beforeEach } from "vitest";
import { AsyncAPITester } from "#emitter/testing.js";
import { TesterInstance } from "@typespec/compiler/testing";
import { byCodePoint } from "../../../../utils/sort.js";
import { diagnosticsWith } from "../../../../utils/diagnostics.js";
import { documentFrom } from "../../../../utils/test-host.js";

describe("Unit: Message headers: inheritance (Phase 3.3)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
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

    const doc = await documentFrom(runner.program);

    const reported = diagnosticsWith(runner.program.diagnostics, "inherited-header-ignored");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("warning");
    expect(reported[0]?.message).toMatch(/'OrderCreated'/);
    // The ordinary nested message would send the author to a fix that does
    // not apply, so it must not fire here.
    expect(diagnosticsWith(runner.program.diagnostics, "nested-header-ignored")).toHaveLength(0);

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

    const doc = await documentFrom(runner.program);

    // A spread copies the property in as the message's own field, so it is
    // lifted. This is the half of the rule `extends` does not reach.
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

    const doc = await documentFrom(runner.program);

    // `Base` lifts `traceId`, and `Derived` inherits the field. A reader of
    // `Derived` expects it there too, so the header repeats on `Derived`.
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
    // Each message gets its own flattened payload component. An `allOf`
    // branch to `Base` would bring `traceId` back into `Derived`'s payload.
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

    const doc = await documentFrom(runner.program);

    // A discriminator on the payload would name subtype components that
    // still require the lifted field, which travels only in `headers`. No
    // payload could satisfy that, so the emitter names the conflict instead.
    const reported = diagnosticsWith(runner.program.diagnostics, "discriminated-lifted-header");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");
    expect(reported[0]?.message).toMatch(/'Base'/);
    expect(doc.components?.schemas?.BasePayload).toEqual({
      type: "object",
      properties: { kind: { type: "string" } },
      required: ["kind"],
    });
    // A discriminator means nothing without its variants, so `Cat`'s own
    // component is emitted too, with every field.
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

    await documentFrom(runner.program);

    // `Outer` pulls in the model's own component, so `@discriminator` is
    // resolved twice for `Base`. One missing property is one mistake, so
    // the author sees one diagnostic.
    expect(
      diagnosticsWith(runner.program.diagnostics, "missing-discriminator-property"),
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

    const doc = await documentFrom(runner.program);

    // The flattened payload has no branch back to `Bag`, so the
    // extra-properties constraint must be merged in, or any extra key
    // would accept any value.
    expect(doc.components?.schemas?.MPayload).toEqual({
      type: "object",
      additionalProperties: { type: "string" },
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

    const doc = await documentFrom(runner.program);

    // The conflict belongs to the model. Nothing else reads `M` here, so the
    // check must still run here, or the payload keeps the wire name in silence.
    expect(
      diagnosticsWith(runner.program.diagnostics, "encoded-name-override-conflict"),
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

    await documentFrom(runner.program);

    // `Outer` builds the model's own component, and the message builds the
    // payload component. One mistake in one model gets one report between them.
    expect(
      diagnosticsWith(runner.program.diagnostics, "encoded-name-override-conflict"),
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

    const doc = await documentFrom(runner.program);

    expect(
      diagnosticsWith(runner.program.diagnostics, "never-typed-property-override"),
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

    const doc = await documentFrom(runner.program);

    // The flattened payload never builds `Base`, and only the `extends` link
    // reaches `Cat`. The discriminated hierarchy the author declared must
    // still reach the document.
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

    const doc = await documentFrom(runner.program);

    // `@headers` describes the whole headers object of `D`, so the inherited
    // lift is cancelled and `h` stays in the payload of `D`. The same field
    // is a header of `B`. One field in two roles is invisible in the
    // document, so the emitter names it.
    const reported = diagnosticsWith(runner.program.diagnostics, "inherited-header-overridden");
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
});
