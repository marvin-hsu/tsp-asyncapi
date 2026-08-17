import { describe, it, expect, beforeEach } from "vitest";
import { AsyncAPITester } from "../../../src/testing/index.js";
import { TesterInstance } from "@typespec/compiler/testing";
import { buildAsyncAPIDocument } from "../../../src/builders/document.js";
import { byCodePoint } from "../../utils/sort.js";

describe("Unit: Messages (Phase 3.1)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("emits a message whose payload references the model's schema", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.components?.messages?.OrderCreated).toEqual({
      name: "OrderCreated",
      payload: { $ref: "#/components/schemas/OrderCreated" },
    });
    expect(doc.components?.schemas?.OrderCreated).toEqual({
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    });
  });

  it("does not emit a model that no message references", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      model Unreferenced {
        name: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(Object.keys(doc.components?.schemas ?? {})).toEqual(["OrderCreated"]);
    expect(doc.components?.schemas?.Unreferenced).toBeUndefined();
  });

  it("uses the decorator argument as the message key", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message("custom-name")
      model OrderCreated {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(Object.keys(doc.components?.messages ?? {})).toEqual(["custom-name"]);
    // The payload still points at the schema key the SchemaBuilder assigned,
    // which the message key does not change.
    expect(doc.components?.messages?.["custom-name"]).toEqual({
      name: "custom-name",
      payload: { $ref: "#/components/schemas/OrderCreated" },
    });
  });

  it("pulls models the payload references transitively into components.schemas", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model Address {
        city: string;
      }

      model Customer {
        address: Address;
      }

      @message
      model OrderCreated {
        customer: Customer;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(Object.keys(doc.components?.schemas ?? {}).sort(byCodePoint)).toEqual([
      "Address",
      "Customer",
      "OrderCreated",
    ]);
    expect(doc.components?.schemas?.Customer.properties?.address).toEqual({
      $ref: "#/components/schemas/Address",
    });
  });

  it("keeps a message key inside the Components Object charset", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message("order/created")
      model OrderCreated {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const keys = Object.keys(doc.components?.messages ?? {});
    expect(keys).toEqual(["OrderSep47Created"]);
    expect(keys[0]).toMatch(/^[a-zA-Z0-9.\-_]+$/);
    // Rewriting the key must not detach the payload from its schema.
    expect(doc.components?.messages?.OrderSep47Created).toEqual({
      name: "OrderSep47Created",
      payload: { $ref: "#/components/schemas/OrderCreated" },
    });
  });

  it("warns when an explicit message name has to be rewritten", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message("order/created")
      model OrderCreated {
        id: string;
      }
    `);

    buildAsyncAPIDocument(runner.program, undefined, {});

    const diagnostic = runner.program.diagnostics.find(
      (d) => d.code === "tsp-asyncapi/sanitized-message-key",
    );
    expect(diagnostic?.severity).toBe("warning");
    expect(String(diagnostic?.message)).toMatch(/'order\/created'/);
    expect(String(diagnostic?.message)).toMatch(/'OrderSep47Created'/);
  });

  it("does not warn when an explicit message name is already a legal key", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message("order.created-v1")
      model OrderCreated {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(Object.keys(doc.components?.messages ?? {})).toEqual(["order.created-v1"]);
    expect(
      runner.program.diagnostics.filter((d) => d.code === "tsp-asyncapi/sanitized-message-key"),
    ).toHaveLength(0);
  });

  it("gives each instantiation of a message template its own key", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Envelope<T> {
        data: T;
      }

      @message
      model Holder {
        a: Envelope<string>;
        b: Envelope<int32>;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // The message keys match the schema keys the SchemaBuilder assigned,
    // minus the namespace prefix that message keys deliberately omit.
    expect(Object.keys(doc.components?.messages ?? {}).sort(byCodePoint)).toEqual([
      "EnvelopeInt32",
      "EnvelopeString",
      "Holder",
    ]);
    expect(doc.components?.messages?.EnvelopeString).toEqual({
      name: "EnvelopeString",
      payload: { $ref: "#/components/schemas/EnvelopeString" },
    });
    expect(
      runner.program.diagnostics.filter((d) => d.code === "tsp-asyncapi/duplicate-message-key"),
    ).toHaveLength(0);
  });

  it("reports an error when two unrelated models share a key through @friendlyName", async () => {
    // Two instantiations of one template that share a key are one
    // declaration, and are deliberately not reported. `@friendlyName` names a
    // key outright, so two unrelated models can share one without being
    // related at all. Treating that as one declaration dropped the second
    // message and its schema while reporting nothing.
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
      model B {
        b: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const diagnostic = runner.program.diagnostics.find(
      (d) => d.code === "tsp-asyncapi/duplicate-message-key",
    );
    expect(diagnostic).toBeDefined();
    expect(String(diagnostic?.message)).toMatch(/Duplicate message name: 'Shared'/);
    // The first model to claim the key keeps it, and its own body stays
    // under that schema key.
    expect(Object.keys(doc.components?.messages ?? {})).toEqual(["Shared"]);
    expect(doc.components?.schemas?.Shared).toEqual({
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
    });
  });

  it("reports an error when two messages resolve to the same key", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      namespace Sales {
        @message
        model OrderCreated {
          id: string;
        }
      }

      namespace Billing {
        @message
        model OrderCreated {
          code: string;
        }
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const diagnostic = runner.program.diagnostics.find(
      (d) => d.code === "tsp-asyncapi/duplicate-message-key",
    );
    expect(diagnostic).toBeDefined();
    expect(String(diagnostic?.message)).toMatch(/Duplicate message name: 'OrderCreated'/);
    // The first model to claim the key keeps it. Nothing is renamed.
    expect(Object.keys(doc.components?.messages ?? {})).toEqual(["OrderCreated"]);
  });

  it("keeps a message key that names an Object prototype member", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message("__proto__")
      model A {
        id: string;
      }

      @message
      model B {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const messages = doc.components?.messages ?? {};
    expect(Object.keys(messages).sort(byCodePoint)).toEqual(["B", "__proto__"]);
    expect(Object.hasOwn(messages, "__proto__")).toBe(true);
    // Read through a descriptor. A plain property access would be ambiguous
    // here: the same syntax reaches the inherited prototype accessor.
    expect(Object.getOwnPropertyDescriptor(messages, "__proto__")?.value).toEqual({
      name: "__proto__",
      payload: { $ref: "#/components/schemas/A" },
    });
  });

  it("does not report a duplicate when one message template is instantiated twice alike", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Env<T> {
        d: T;
      }

      @message
      model Holder {
        a: Env<{ x: string }>;
        b: Env<{ x: string }>;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // The two instantiations are separate compiler types, but they share one
    // schema key, so they are one declaration in the document. No explicit
    // @message name could separate them.
    expect(
      runner.program.diagnostics.filter((d) => d.code === "tsp-asyncapi/duplicate-message-key"),
    ).toHaveLength(0);
    const messageKeys = Object.keys(doc.components?.messages ?? {}).filter((k) => k !== "Holder");
    expect(messageKeys).toHaveLength(1);
    const key = messageKeys[0] ?? "";
    expect(doc.components?.schemas?.[key]).toBeDefined();
    expect(doc.components?.messages?.[key]).toEqual({
      name: key,
      payload: { $ref: `#/components/schemas/${key}` },
    });
  });

  it("warns when a message key names a discriminated subtype's schema", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @discriminator("kind")
      model Pet {
        kind: string;
      }

      model Cat extends Pet {
        kind: "cat";
      }

      @message("Cat")
      model PetEvent {
        pet: Pet;
      }
    `);

    buildAsyncAPIDocument(runner.program, undefined, {});

    const diagnostic = runner.program.diagnostics.find(
      (d) => d.code === "tsp-asyncapi/message-key-shadows-schema-key",
    );
    expect(diagnostic?.severity).toBe("warning");
    expect(String(diagnostic?.message)).toMatch(/'Cat'/);
  });

  it("refs a message payload whose model has no compact composed name", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Envelope<T> {
        data: T;
      }

      model Holder {
        a: Envelope<{ x: string }>;
      }

      @message
      model Root {
        h: Holder;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const messageKeys = Object.keys(doc.components?.messages ?? {}).filter((k) => k !== "Root");
    expect(messageKeys).toHaveLength(1);
    const key = messageKeys[0] ?? "";
    // The payload is a reference, not a second inline copy of the schema.
    expect(doc.components?.messages?.[key]).toEqual({
      name: key,
      payload: { $ref: `#/components/schemas/${key}` },
    });
    expect(doc.components?.schemas?.[key]).toBeDefined();
    // The property that also reaches the same model resolves to the same
    // component.
    expect(doc.components?.schemas?.Holder.properties?.a).toEqual({
      $ref: `#/components/schemas/${key}`,
    });
  });

  it("emits every subtype of a discriminated payload model", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @discriminator("kind")
      model Pet {
        kind: string;
        name: string;
      }

      model Cat extends Pet {
        kind: "cat";
        meow: boolean;
      }

      model Dog extends Pet {
        kind: "dog";
        bark: boolean;
      }

      model Siamese extends Cat {
        crossEyed: boolean;
      }

      @message
      model PetEvent {
        pet: Pet;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.components?.schemas?.Pet.discriminator).toBe("kind");
    // An indirect subtype is collected too. Only the model carrying
    // @discriminator drives the walk, so the walk has to be transitive.
    expect(Object.keys(doc.components?.schemas ?? {}).sort(byCodePoint)).toEqual([
      "Cat",
      "Dog",
      "Pet",
      "PetEvent",
      "Siamese",
    ]);
    expect(doc.components?.schemas?.Cat.allOf?.[0]).toEqual({
      $ref: "#/components/schemas/Pet",
    });
  });

  it("does not collect subtypes when the discriminator is dropped", async () => {
    // The base declares no `kind` property, so the emitter omits
    // `discriminator`. The compiler reports its own diagnostic for that, so
    // this case cannot use the diagnostic-free `compile`.
    await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @discriminator("kind")
      model Pet {
        name: string;
      }

      model Cat extends Pet {
        meow: boolean;
      }

      @message
      model PetEvent {
        pet: Pet;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.components?.schemas?.Pet.discriminator).toBeUndefined();
    expect(Object.keys(doc.components?.schemas ?? {}).sort(byCodePoint)).toEqual([
      "Pet",
      "PetEvent",
    ]);
  });

  it("warns when an explicitly empty message name falls back to the model name", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message("")
      model OrderCreated {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(Object.keys(doc.components?.messages ?? {})).toEqual(["OrderCreated"]);
    const diagnostic = runner.program.diagnostics.find(
      (d) => d.code === "tsp-asyncapi/sanitized-message-key",
    );
    expect(diagnostic?.severity).toBe("warning");
    expect(String(diagnostic?.message)).toMatch(/'OrderCreated'/);
  });

  it("warns when a backtick-quoted model name has to be rewritten", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model \`order/created\` {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(Object.keys(doc.components?.messages ?? {})).toEqual(["OrderSep47Created"]);
    const diagnostic = runner.program.diagnostics.find(
      (d) => d.code === "tsp-asyncapi/sanitized-message-key",
    );
    expect(diagnostic?.severity).toBe("warning");
    expect(String(diagnostic?.message)).toMatch(/'order\/created'/);
    expect(String(diagnostic?.message)).toMatch(/'OrderSep47Created'/);
  });

  it("does not warn when a message key is composed from template arguments", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Envelope<T> {
        data: T;
      }

      model Holder {
        a: Envelope<string>;
      }

      @message
      model Root {
        h: Holder;
      }
    `);

    buildAsyncAPIDocument(runner.program, undefined, {});

    expect(
      runner.program.diagnostics.filter((d) => d.code === "tsp-asyncapi/sanitized-message-key"),
    ).toHaveLength(0);
  });

  it("reports an error when @message is applied twice to one model", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message("one")
      @message("two")
      model OrderCreated {
        id: string;
      }
    `);

    const diagnostic = diagnostics.find(
      (d) => d.code === "tsp-asyncapi/duplicate-message-decorator",
    );
    expect(diagnostic?.severity).toBe("error");

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    // The first application to run keeps the model. Decorators run
    // bottom-up, so that is the one written last.
    expect(Object.keys(doc.components?.messages ?? {})).toEqual(["two"]);
  });

  it("warns when a message key names a different type's schema", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      namespace Sales {
        @message
        model Ev {
          id: string;
        }
      }

      @message("Sales.Ev")
      model Other {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.components?.messages?.["Sales.Ev"]).toEqual({
      name: "Sales.Ev",
      payload: { $ref: "#/components/schemas/Other" },
    });
    const diagnostic = runner.program.diagnostics.find(
      (d) => d.code === "tsp-asyncapi/message-key-shadows-schema-key",
    );
    expect(diagnostic?.severity).toBe("warning");
    expect(String(diagnostic?.message)).toMatch(/'Sales\.Ev'/);
  });

  it("does not warn when a message key is its own model's schema key", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }
    `);

    buildAsyncAPIDocument(runner.program, undefined, {});

    expect(
      runner.program.diagnostics.filter(
        (d) => d.code === "tsp-asyncapi/message-key-shadows-schema-key",
      ),
    ).toHaveLength(0);
  });

  it("omits components when the program declares no message", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      model Unreferenced {
        name: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.components).toBeUndefined();
  });
});

describe("Unit: Message description fields (Phase 3.2)", () => {
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

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

    const reported = diagnostics.filter(
      (d) => d.code === "tsp-asyncapi/duplicate-content-type-decorator",
    );
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");

    // Decorators run bottom-up, so the one written last in the source is the
    // one that reaches the state first, and it keeps the message. This is the
    // same winner @message, @headers, and @correlationId keep.
    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
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

    const reported = diagnostics.filter((d) => d.code === "tsp-asyncapi/empty-content-type");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");

    // The message falls back to the document `defaultContentType`. The user
    // typed the empty string, so that fallback must not be silent.
    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
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
    expect(diagnostics.filter((d) => d.code === "tsp-asyncapi/empty-content-type")).toHaveLength(1);
    expect(
      diagnostics.filter((d) => d.code === "tsp-asyncapi/duplicate-content-type-decorator"),
    ).toHaveLength(1);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
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

    buildAsyncAPIDocument(runner.program, undefined, {});

    // The empty value never reaches the document, so it is not a second
    // source of the content type. Only the empty value itself is reported.
    // The header check runs while the headers are planned, so its diagnostic
    // lands on the program rather than in the compile result.
    expect(
      runner.program.diagnostics.filter(
        (d) => d.code === "tsp-asyncapi/content-type-header-conflict",
      ),
    ).toHaveLength(0);
    expect(
      runner.program.diagnostics.filter((d) => d.code === "tsp-asyncapi/empty-content-type"),
    ).toHaveLength(1);
  });
});

describe("Unit: Decorator conflicts (Phase 3.8)", () => {
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

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

    buildAsyncAPIDocument(runner.program, undefined, {});

    // The key collision drops `B`, but the conflict inside `B` is a separate
    // mistake. Reporting it only after the collision is fixed would hand the
    // user one error at a time.
    expect(
      runner.program.diagnostics.filter((d) => d.code === "tsp-asyncapi/duplicate-message-key"),
    ).toHaveLength(1);
    const reported = runner.program.diagnostics.filter(
      (d) => d.code === "tsp-asyncapi/conflicting-tag-metadata",
    );
    expect(reported).toHaveLength(1);
    expect(reported[0]?.message).toMatch(/'description'/);
  });
});

describe("Unit: Messages — source order", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  /**
   * `components.messages` follows the source, not the order the compiler
   * happened to check each model in.
   */
  async function messageKeys(code: string): Promise<string[]> {
    await runner.compile(code);
    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    return Object.keys(doc.components?.messages ?? {});
  }

  it("keeps declaration order when no message refers to another", async () => {
    expect(
      await messageKeys(`
        @service(#{ title: "Orders" })
        namespace Test;

        @message model Alpha { x: string; }
        @message model Beta { x: string; }
        @message model Gamma { x: string; }
      `),
    ).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("keeps declaration order when a message refers to one declared later", async () => {
    // The compiler checks `Gamma` while checking `Alpha`'s property, so
    // `@message` runs on `Gamma` first. Reading the state map in its own
    // order would emit `Gamma, Alpha, Beta` here, and adding this one
    // reference would reorder the whole of `components.messages`.
    expect(
      await messageKeys(`
        @service(#{ title: "Orders" })
        namespace Test;

        @message model Alpha { g: Gamma; }
        @message model Beta { x: string; }
        @message model Gamma { x: string; }
      `),
    ).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("puts a message the service namespace declares later after an earlier one", async () => {
    // A chain of references, so every model is checked before the one that
    // names it. Only a sort by source position recovers the written order.
    expect(
      await messageKeys(`
        @service(#{ title: "Orders" })
        namespace Test;

        @message model First { s: Second; }
        @message model Second { t: Third; }
        @message model Third { x: string; }
      `),
    ).toEqual(["First", "Second", "Third"]);
  });
});
