/**
 * What a generated Protobuf payload looks like in the emitted document.
 *
 * Everything below runs the whole emitter. The official decorators write
 * their state, and the provider walks that state and renders proto3 text.
 * These cases read the text of the file this emitter writes. Nothing is
 * asserted against an index or a pipeline call, because what a project gets
 * is the file.
 *
 * Four answers are settled here. Two messages of one package are two
 * payloads. A model a message only reaches through a field rides inside that
 * message's payload and gets none of its own. A schema the author wrote wins
 * over a generated one, and the author is told. A model the provider cannot
 * answer for stops the emit.
 *
 * The official Protobuf decorators are written qualified. Both libraries
 * export a decorator named `message`, and the AsyncAPI one is the one these
 * sources reach for most.
 */

import { describe, expect, it } from "vitest";
import { createTester } from "@typespec/compiler/testing";
import type { Diagnostic } from "@typespec/compiler";
import { fileURLToPath } from "node:url";
import { PACKAGE_NAME } from "#emitter/lib.js";
import type { AsyncAPIDocument } from "#emitter/types/index.js";
import { diagnosticsWith } from "../../../../utils/diagnostics.js";
import { resolveRef } from "../../../../utils/json-pointer.js";
import { referencesIn } from "../../../../utils/references.js";
import yaml from "yaml";

/** The root of the emitter package, which holds the official library as a dependency. */
const PACKAGE_ROOT = fileURLToPath(
  new URL("../../../../../packages/tsp-asyncapi", import.meta.url),
);

/** The AsyncAPI schema format of proto3 text. */
const PROTOBUF = "application/vnd.google.protobuf;version=3";

/** The file the emitter writes with the default options. */
const OUTPUT_FILE = "asyncapi.yaml";

/**
 * A tester that compiles both libraries and runs this emitter with the
 * feature on.
 */
const ProtobufEmitTester = createTester(PACKAGE_ROOT, {
  libraries: [PACKAGE_NAME, "@typespec/protobuf"],
})
  .importLibraries()
  .using("AsyncAPI")
  .emit(PACKAGE_NAME, { "preview-features": ["protobuf"] });

/** What one compilation produced. */
interface Emitted {
  /** The parsed document, or null when the emitter wrote nothing. */
  readonly doc: AsyncAPIDocument | null;
  /** Every diagnostic the compilation reported. */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Compiles one source with the preview feature on and parses the output.
 *
 * @param code - The TypeSpec source of the case
 * @returns The document the emitter wrote, and every diagnostic
 */
async function emit(code: string): Promise<Emitted> {
  const [result, diagnostics] = await ProtobufEmitTester.compileAndDiagnose(code);
  const outputs: Record<string, string | undefined> = result.outputs;
  const content = outputs[OUTPUT_FILE];
  if (content === undefined) return { doc: null, diagnostics };
  return { doc: yaml.parse(content) as AsyncAPIDocument, diagnostics };
}

/**
 * Reads the document of a case that is meant to compile clean.
 *
 * @param code - The TypeSpec source of the case
 * @returns The document the emitter wrote
 */
async function emitClean(code: string): Promise<AsyncAPIDocument> {
  const { doc, diagnostics } = await emit(code);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  expect(errors.map((diagnostic) => diagnostic.message)).toEqual([]);
  if (doc === null) throw new Error("The emitter wrote no document for a clean compilation.");
  return doc;
}

/** Two messages of one package, and one message of a package of its own. */
const TWO_PACKAGES = `
  @service(#{ title: "Orders" })
  namespace Test;

  @Protobuf.package({ name: "com.example.orders" })
  namespace Test.Orders {
    @message
    @Protobuf.message
    model OrderCreated {
      @Protobuf.field(1)
      orderId: string;
    }

    @message
    @Protobuf.message
    model OrderShipped {
      @Protobuf.field(1)
      orderId: string;
    }
  }

  @Protobuf.package({ name: "com.example.billing" })
  namespace Test.Billing {
    @message
    @Protobuf.message
    model InvoiceIssued {
      @Protobuf.field(1)
      invoiceId: string;
    }
  }

  @channel("orders.created")
  interface Created {
    @send
    op created(event: Test.Orders.OrderCreated): void;
  }

  @channel("orders.shipped")
  interface Shipped {
    @send
    op shipped(event: Test.Orders.OrderShipped): void;
  }

  @channel("billing.issued")
  interface Issued {
    @send
    op issued(event: Test.Billing.InvoiceIssued): void;
  }
`;

/**
 * Reads the payload of one message of the document.
 *
 * @param doc - The emitted document
 * @param name - The name of the message component
 * @returns The multi format payload of that message
 */
function payloadOf(doc: AsyncAPIDocument, name: string): { schemaFormat: string; schema: string } {
  const payload = doc.components?.messages?.[name].payload;
  return payload as { schemaFormat: string; schema: string };
}

/** One message that reaches another model through a field, and one that does not. */
const FIELD_ONLY = `
  @service(#{ title: "Orders" })
  namespace Test;

  @Protobuf.package({ name: "com.example.orders" })
  namespace Test.Orders {
    @Protobuf.message
    model Money {
      @Protobuf.field(1)
      currency: string;

      @Protobuf.field(2)
      amount: int64;
    }

    @message
    @Protobuf.message
    model OrderPlaced {
      @Protobuf.field(1)
      orderId: string;

      @Protobuf.field(2)
      total: Money;
    }

    @message
    @Protobuf.message
    model OrderShipped {
      @Protobuf.field(1)
      orderId: string;

      @Protobuf.field(2)
      carrier: string;
    }
  }

  @channel("orders.placed")
  interface Placed {
    @send
    op placed(event: Test.Orders.OrderPlaced): void;
  }

  @channel("orders.shipped")
  interface Shipped {
    @send
    op shipped(event: Test.Orders.OrderShipped): void;
  }
`;

describe("Unit: Protobuf generated payloads", () => {
  it("keeps two messages of one package apart", async () => {
    const doc = await emitClean(TWO_PACKAGES);

    // The two texts hold the same package, and each marks its own message as
    // the root. So the payloads are two schemas, not one shared component. A
    // shared one would tell a consumer that one type decodes both, and the
    // wire formats disagree.
    const created = doc.components?.messages?.OrderCreated.payload as
      { schema: string } | undefined;
    const shipped = doc.components?.messages?.OrderShipped.payload as
      { schema: string } | undefined;
    expect(created).toMatchObject({ schemaFormat: PROTOBUF });
    expect(shipped).toMatchObject({ schemaFormat: PROTOBUF });
    expect(created?.schema).toContain("message OrderCreated {");
    expect(shipped?.schema).toContain("message OrderShipped {");
    expect(doc.components?.schemas).toBeUndefined();
  });

  it("writes one payload for one model two channels carry", async () => {
    const doc = await emitClean(`
      @service(#{ title: "Orders" })
      namespace Test;

      @Protobuf.package({ name: "com.example.orders" })
      namespace Test.Orders {
        @message
        @Protobuf.message
        model OrderEvent {
          @Protobuf.field(1)
          orderId: string;
        }
      }

      @channel("orders.created")
      interface Created {
        @send
        op created(event: Test.Orders.OrderEvent): void;
      }

      @channel("orders.archived")
      interface Archived {
        @send
        op archived(event: Test.Orders.OrderEvent): void;
      }
    `);

    // One model is one message of the document, whatever names it. The
    // message component is written once, both channels reference it, and the
    // payload sits inside it. So the sharing a reused model needs already
    // happens one level up, and no schema component is required for it.
    const payload = doc.components?.messages?.OrderEvent.payload as { schema: string } | undefined;
    expect(payload).toMatchObject({ schemaFormat: PROTOBUF });
    expect(payload?.schema).toContain("message OrderEvent {");

    const reference = { $ref: "#/components/messages/OrderEvent" };
    expect(doc.channels?.["orders.created"]?.messages?.OrderEvent).toEqual(reference);
    expect(doc.channels?.["orders.archived"]?.messages?.OrderEvent).toEqual(reference);
    expect(doc.components?.schemas).toBeUndefined();
  });

  it("keeps a package only one message uses in place", async () => {
    const doc = await emitClean(TWO_PACKAGES);

    // One use has nothing to share with, so a component would add a hop and
    // save nothing.
    const payload = doc.components?.messages?.InvoiceIssued.payload as
      { schema: string } | undefined;
    expect(payload).toMatchObject({ schemaFormat: PROTOBUF });
    expect(payload?.schema).toContain("package com.example.billing;");
    expect(doc.components?.schemas?.InvoiceIssuedPayload).toBeUndefined();
  });

  it("writes no schema component for three single-use payloads", async () => {
    const doc = await emitClean(TWO_PACKAGES);

    // Each model is one payload used once, so every schema stays in its
    // message and the schemas section is empty.
    expect(doc.components?.schemas).toBeUndefined();
  });

  it("resolves every reference it wrote", async () => {
    const doc = await emitClean(TWO_PACKAGES);

    const pointers = referencesIn(doc);
    expect(pointers.length).toBeGreaterThan(0);
    const unresolved = pointers.filter((pointer) => resolveRef(doc, pointer) === undefined);
    expect(unresolved).toEqual([]);
  });

  it("emits a document the official parser accepts", async () => {
    const doc = await emitClean(TWO_PACKAGES);

    await expect(doc).toBeValidAsyncAPI();
  });

  /**
   * A model a message reaches through a field is part of that message's
   * schema. It is not a message of the document, so it gets no payload of its
   * own, and it must not leak into the payload of a message that never
   * reaches it.
   */
  it("carries a field-only model inside the payload that reaches it", async () => {
    const doc = await emitClean(FIELD_ONLY);

    const placed = payloadOf(doc, "OrderPlaced");
    expect(placed.schema).toContain("message OrderPlaced {");
    expect(placed.schema).toContain("message Money {");
    expect(placed.schema).toContain("  Money total = 2;");

    // `OrderShipped` names no `Money` field, so its payload declares none.
    const shipped = payloadOf(doc, "OrderShipped");
    expect(shipped.schema).toContain("message OrderShipped {");
    expect(shipped.schema).not.toContain("Money");

    // `Money` carries no `@AsyncAPI.message`, so the document has no message
    // for it and nothing generated one.
    expect(doc.components?.messages?.Money).toBeUndefined();
  });

  it("emits a document with a field-only model that the official parser accepts", async () => {
    await expect(await emitClean(FIELD_ONLY)).toBeValidAsyncAPI();
  });

  it("keeps the payload the author wrote and reports the conflict once", async () => {
    const { doc, diagnostics } = await emit(`
      @service(#{ title: "Orders" })
      namespace Test;

      @Protobuf.package({ name: "com.example.orders" })
      namespace Test.Orders {
        @message
        @rawPayload("${PROTOBUF}", "syntax = \\"proto3\\";\\npackage authored;")
        @Protobuf.message
        model OrderCreated {
          @Protobuf.field(1)
          orderId: string;
        }
      }

      @channel("orders.created")
      interface Created {
        @send
        op created(event: Test.Orders.OrderCreated): void;
      }
    `);

    // The authored schema is the explicit statement of the two, so it is the
    // one the document carries.
    expect(doc?.components?.messages?.OrderCreated.payload).toEqual({
      schemaFormat: PROTOBUF,
      schema: 'syntax = "proto3";\npackage authored;',
    });

    const reported = diagnosticsWith(diagnostics, "conflicting-message-schema-source");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("warning");
    expect(reported[0]?.message).toContain("protobuf");
  });

  /**
   * A model the provider cannot answer for stops the emit.
   *
   * The payload of such a model falls back to the schema its TypeSpec type
   * produces. That document describes the model with ordinary JSON Schema
   * while the project asked for proto3, and nothing in the file says so.
   * Reporting the error does not prevent it, because the emitter writes the
   * file whatever the diagnostics say.
   */
  it("writes no document when an artifact is unavailable", async () => {
    const { doc, diagnostics } = await emit(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @Protobuf.message
      model OrderCreated {
        @Protobuf.field(1)
        orderId: string;
      }

      @channel("orders.created")
      interface Created {
        @send
        op created(event: OrderCreated): void;
      }
    `);

    // The model sits in no `@Protobuf.package`, so no artifact can exist.
    expect(diagnosticsWith(diagnostics, "protobuf-artifact-unavailable")).toHaveLength(1);
    expect(doc).toBeNull();
  });
});
