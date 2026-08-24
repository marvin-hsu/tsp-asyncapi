/**
 * What a generated Protobuf payload looks like in the emitted document.
 *
 * Everything below runs the whole emitter. The official decorators compile,
 * and the provider runs the official emitter. These cases read the text of
 * the file this emitter writes. Nothing is asserted against an index or a
 * pipeline call, because what a project gets is the file.
 *
 * Three answers are settled here. A schema two messages share is written once
 * and referenced twice. A schema one message uses stays where it is. A schema
 * the author wrote wins over a generated one, and the author is told.
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
import { diagnosticsWith } from "../../../utils/diagnostics.js";
import { resolveRef } from "../../../utils/json-pointer.js";
import { referencesIn } from "../../../utils/references.js";
import yaml from "yaml";

/** The root of the emitter package, which holds the official library as a dependency. */
const PACKAGE_ROOT = fileURLToPath(new URL("../../../../packages/tsp-asyncapi", import.meta.url));

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

describe("Unit: Protobuf generated payloads (Phase 16 P4)", () => {
  it("writes one component for the package two messages share", async () => {
    const doc = await emitClean(TWO_PACKAGES);

    // The two messages of one package describe the same text, so the second
    // use is what earns the component. The key comes from the message that
    // carried the schema first.
    const shared = doc.components?.schemas?.OrderCreatedPayload as { schema: string } | undefined;
    expect(shared).toMatchObject({ schemaFormat: PROTOBUF });
    expect(shared?.schema).toContain("package com.example.orders;");

    const reference = { $ref: "#/components/schemas/OrderCreatedPayload" };
    expect(doc.components?.messages?.OrderCreated.payload).toEqual(reference);
    expect(doc.components?.messages?.OrderShipped.payload).toEqual(reference);
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

  it("writes one component and no more for three generated payloads", async () => {
    const doc = await emitClean(TWO_PACKAGES);

    // Every payload here is generated, so no model produced a schema of its
    // own. The shared package is the only component the document needs.
    expect(Object.keys(doc.components?.schemas ?? {})).toEqual(["OrderCreatedPayload"]);
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
});
