import { describe, it, expect, beforeEach } from "vitest";
import { AsyncAPITester } from "#emitter/testing.js";
import { TesterInstance } from "@typespec/compiler/testing";
import { byCodePoint } from "../../../../utils/sort.js";
import { diagnosticsWith, findDiagnostic } from "../../../../utils/diagnostics.js";
import { documentFrom } from "../../../../utils/test-host.js";
import { schemaOf, schemasOf } from "../../../../utils/document.js";

describe("Unit: Messages — declaration", () => {
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

    const doc = await documentFrom(runner.program);

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

    const doc = await documentFrom(runner.program);

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

    const doc = await documentFrom(runner.program);

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

    const doc = await documentFrom(runner.program);

    expect(Object.keys(doc.components?.schemas ?? {}).sort(byCodePoint)).toEqual([
      "Address",
      "Customer",
      "OrderCreated",
    ]);
    expect(schemaOf(schemasOf(doc).Customer).properties?.address).toEqual({
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

    const doc = await documentFrom(runner.program);

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

    await documentFrom(runner.program);

    const diagnostic = findDiagnostic(runner.program.diagnostics, "sanitized-message-key");
    expect(diagnostic.severity).toBe("warning");
    expect(diagnostic.message).toMatch(/'order\/created'/);
    expect(diagnostic.message).toMatch(/'OrderSep47Created'/);
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

    const doc = await documentFrom(runner.program);

    expect(Object.keys(doc.components?.messages ?? {})).toEqual(["order.created-v1"]);
    expect(diagnosticsWith(runner.program.diagnostics, "sanitized-message-key")).toHaveLength(0);
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

    const doc = await documentFrom(runner.program);

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
    expect(diagnosticsWith(runner.program.diagnostics, "duplicate-message-key")).toHaveLength(0);
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

    const doc = await documentFrom(runner.program);

    const diagnostic = findDiagnostic(runner.program.diagnostics, "duplicate-message-key");
    expect(diagnostic.message).toMatch(/Duplicate message name: 'Shared'/);
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

    const doc = await documentFrom(runner.program);

    const diagnostic = findDiagnostic(runner.program.diagnostics, "duplicate-message-key");
    expect(diagnostic.message).toMatch(/Duplicate message name: 'OrderCreated'/);
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

    const doc = await documentFrom(runner.program);

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

    const doc = await documentFrom(runner.program);

    // The two instantiations are separate compiler types, but they share one
    // schema key, so they are one declaration in the document. No explicit
    // @message name could separate them.
    expect(diagnosticsWith(runner.program.diagnostics, "duplicate-message-key")).toHaveLength(0);
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

    await documentFrom(runner.program);

    const diagnostic = findDiagnostic(runner.program.diagnostics, "message-key-shadows-schema-key");
    expect(diagnostic.severity).toBe("warning");
    expect(diagnostic.message).toMatch(/'Cat'/);
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

    const doc = await documentFrom(runner.program);

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
    expect(schemaOf(schemasOf(doc).Holder).properties?.a).toEqual({
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

    const doc = await documentFrom(runner.program);

    expect(schemaOf(schemasOf(doc).Pet).discriminator).toBe("kind");
    // An indirect subtype is collected too. Only the model carrying
    // @discriminator drives the walk, so the walk has to be transitive.
    expect(Object.keys(doc.components?.schemas ?? {}).sort(byCodePoint)).toEqual([
      "Cat",
      "Dog",
      "Pet",
      "PetEvent",
      "Siamese",
    ]);
    expect(schemaOf(schemasOf(doc).Cat).allOf?.[0]).toEqual({
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

    const doc = await documentFrom(runner.program);

    expect(schemaOf(schemasOf(doc).Pet).discriminator).toBeUndefined();
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

    const doc = await documentFrom(runner.program);

    expect(Object.keys(doc.components?.messages ?? {})).toEqual(["OrderCreated"]);
    const diagnostic = findDiagnostic(runner.program.diagnostics, "sanitized-message-key");
    expect(diagnostic.severity).toBe("warning");
    expect(diagnostic.message).toMatch(/'OrderCreated'/);
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

    const doc = await documentFrom(runner.program);

    expect(Object.keys(doc.components?.messages ?? {})).toEqual(["OrderSep47Created"]);
    const diagnostic = findDiagnostic(runner.program.diagnostics, "sanitized-message-key");
    expect(diagnostic.severity).toBe("warning");
    expect(diagnostic.message).toMatch(/'order\/created'/);
    expect(diagnostic.message).toMatch(/'OrderSep47Created'/);
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

    await documentFrom(runner.program);

    expect(diagnosticsWith(runner.program.diagnostics, "sanitized-message-key")).toHaveLength(0);
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

    const diagnostic = findDiagnostic(diagnostics, "duplicate-message-decorator");
    expect(diagnostic.severity).toBe("error");

    const doc = await documentFrom(runner.program);
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

    const doc = await documentFrom(runner.program);

    expect(doc.components?.messages?.["Sales.Ev"]).toEqual({
      name: "Sales.Ev",
      payload: { $ref: "#/components/schemas/Other" },
    });
    const diagnostic = findDiagnostic(runner.program.diagnostics, "message-key-shadows-schema-key");
    expect(diagnostic.severity).toBe("warning");
    expect(diagnostic.message).toMatch(/'Sales\.Ev'/);
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

    await documentFrom(runner.program);

    expect(
      diagnosticsWith(runner.program.diagnostics, "message-key-shadows-schema-key"),
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

    const doc = await documentFrom(runner.program);

    expect(doc.components).toBeUndefined();
  });
});
