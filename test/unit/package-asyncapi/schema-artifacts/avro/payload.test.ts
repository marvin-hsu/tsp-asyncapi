/**
 * What a generated Avro payload looks like in the emitted document.
 *
 * Everything below runs the whole emitter. The Avro decorators write their
 * state, the provider calls the Avro walk, and these cases read the file this
 * emitter writes. Nothing is asserted against an index or a pipeline call,
 * because what a project gets is the file.
 *
 * An Avro payload is an object rather than text. Avro is JSON, and AsyncAPI
 * asks for a schema of a JSON based format to be inlined rather than carried
 * as a string. That is the first thing every case here reads.
 *
 * The Avro decorators are written qualified. `record` and `namespace` are
 * TypeSpec keywords, so they carry backticks as well.
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

/** The root of the emitter package, which holds the Avro library beside it. */
const PACKAGE_ROOT = fileURLToPath(
  new URL("../../../../../packages/tsp-asyncapi", import.meta.url),
);

/** The AsyncAPI schema format of an Avro schema. */
const AVRO = "application/vnd.apache.avro;version=1.9.0";

/** The file the emitter writes with the default options. */
const OUTPUT_FILE = "asyncapi.yaml";

/** A tester that compiles both libraries and runs this emitter with the feature on. */
const AvroEmitTester = createTester(PACKAGE_ROOT, {
  libraries: [PACKAGE_NAME, "tsp-avro"],
})
  .importLibraries()
  .using("AsyncAPI")
  .emit(PACKAGE_NAME, { "preview-features": ["avro"] });

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
  const [result, diagnostics] = await AvroEmitTester.compileAndDiagnose(code);
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

/**
 * Reads the payload of one message of the document.
 *
 * @param doc - The emitted document
 * @param name - The name of the message component
 * @returns The multi format payload of that message
 */
function payloadOf(doc: AsyncAPIDocument, name: string): { schemaFormat: string; schema: unknown } {
  const payload = doc.components?.messages?.[name].payload;
  return payload as { schemaFormat: string; schema: unknown };
}

/** Two messages of one Avro namespace, and a model only one of them reaches. */
const TWO_MESSAGES = `
  @service(#{ title: "Orders" })
  namespace Test;

  @Avro.\`namespace\`("com.example.orders")
  namespace Test.Orders {
    model Money {
      currency: string;
      amount: int64;
    }

    @message
    @Avro.\`record\`
    model OrderPlaced {
      orderId: string;
      total: Money;
    }

    @message
    @Avro.\`record\`
    model OrderShipped {
      orderId: string;
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

/** One Avro record described twice, once per message. */
const SHARED_RECORD = `
  @service(#{ title: "Orders" })
  namespace Test;

  @Avro.\`namespace\`("com.example.orders")
  namespace Test.Placed {
    @message("OrderPlaced")
    @Avro.\`record\`
    model Ping {
      id: string;
    }
  }

  @Avro.\`namespace\`("com.example.orders")
  namespace Test.Archived {
    @message("OrderArchived")
    @Avro.\`record\`
    model Ping {
      id: string;
    }
  }

  @channel("orders.placed")
  interface Placed {
    @send
    op placed(event: Test.Placed.Ping): void;
  }

  @channel("orders.archived")
  interface Archived {
    @send
    op archived(event: Test.Archived.Ping): void;
  }
`;

describe("Unit: Avro generated payloads", () => {
  it("writes each payload as an object the Avro walk built", async () => {
    const doc = await emitClean(TWO_MESSAGES);

    // The whole schema is inline, and it is a value rather than text. An Avro
    // reader takes this object as it stands.
    expect(payloadOf(doc, "OrderPlaced")).toEqual({
      schemaFormat: AVRO,
      schema: {
        type: "record",
        name: "OrderPlaced",
        namespace: "com.example.orders",
        fields: [
          { name: "orderId", type: "string" },
          {
            name: "total",
            type: {
              type: "record",
              name: "Money",
              namespace: "com.example.orders",
              fields: [
                { name: "currency", type: "string" },
                { name: "amount", type: "long" },
              ],
            },
          },
        ],
      },
    });
  });

  /**
   * A model a message reaches through a field is part of that message's
   * schema. It is not a message of the document, so it gets no payload of its
   * own, and it must not leak into the payload of a message that never
   * reaches it.
   */
  it("carries a field-only model inside the payload that reaches it", async () => {
    const doc = await emitClean(TWO_MESSAGES);

    const shipped = payloadOf(doc, "OrderShipped");
    expect(JSON.stringify(shipped.schema)).not.toContain("Money");
    expect(doc.components?.messages?.Money).toBeUndefined();
  });

  it("writes one message component for one model two channels carry", async () => {
    const doc = await emitClean(`
      @service(#{ title: "Orders" })
      namespace Test;

      @Avro.\`namespace\`("com.example.orders")
      namespace Test.Orders {
        @message
        @Avro.\`record\`
        model OrderEvent {
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

    // One model is one message of the document, whatever names it, so the
    // sharing a reused model needs happens one level up.
    const reference = { $ref: "#/components/messages/OrderEvent" };
    expect(doc.channels?.["orders.created"]?.messages?.OrderEvent).toEqual(reference);
    expect(doc.channels?.["orders.archived"]?.messages?.OrderEvent).toEqual(reference);
    expect(payloadOf(doc, "OrderEvent").schemaFormat).toBe(AVRO);
    expect(doc.components?.schemas).toBeUndefined();
  });

  /**
   * Two messages that carry the same Avro record share one component.
   *
   * The two models are two declarations, and both resolve to one Avro full
   * name with one set of fields, so the rendered schema of each is the same
   * value. A raw schema has no name of its own, so the second use is what
   * earns it a place in `components.schemas`, and the key comes from the
   * message that carried it first.
   */
  it("promotes one record two messages carry, and points both at it", async () => {
    const doc = await emitClean(SHARED_RECORD);

    const promoted = doc.components?.schemas?.OrderPlacedPayload;
    expect(promoted).toEqual({
      schemaFormat: AVRO,
      schema: {
        type: "record",
        name: "Ping",
        namespace: "com.example.orders",
        fields: [{ name: "id", type: "string" }],
      },
    });

    // One entry, and both messages reach it by reference.
    expect(Object.keys(doc.components?.schemas ?? {})).toEqual(["OrderPlacedPayload"]);
    const reference = { $ref: "#/components/schemas/OrderPlacedPayload" };
    expect(doc.components?.messages?.OrderPlaced.payload).toEqual(reference);
    expect(doc.components?.messages?.OrderArchived.payload).toEqual(reference);
  });

  it("resolves every reference it wrote", async () => {
    const doc = await emitClean(SHARED_RECORD);

    const pointers = referencesIn(doc);
    expect(pointers.length).toBeGreaterThan(0);
    const unresolved = pointers.filter((pointer) => resolveRef(doc, pointer) === undefined);
    expect(unresolved).toEqual([]);
  });

  it("emits a document the official parser accepts", async () => {
    await expect(await emitClean(TWO_MESSAGES)).toBeValidAsyncAPI();
  });

  it("emits a promoted payload the official parser accepts", async () => {
    await expect(await emitClean(SHARED_RECORD)).toBeValidAsyncAPI();
  });

  /**
   * A record the document asks nothing about is skipped, silently.
   *
   * The model below carries `@Avro.record` and no `@AsyncAPI.message`, and the
   * Avro walk refuses it. A provider that walked it anyway would report a
   * problem about a message that does not exist, and would stop the emit of a
   * document that has nothing to do with it.
   */
  it("says nothing about a refused record no message describes", async () => {
    const { doc, diagnostics } = await emit(`
      @service(#{ title: "Orders" })
      namespace Test;

      @Avro.\`namespace\`("com.example.orders")
      namespace Test.Orders {
        @Avro.\`record\`
        model Internal {
          anything: unknown;
        }

        @message
        @Avro.\`record\`
        model OrderPlaced {
          orderId: string;
        }
      }

      @channel("orders.placed")
      interface Placed {
        @send
        op placed(event: Test.Orders.OrderPlaced): void;
      }
    `);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([]);
    expect(doc?.components?.messages?.OrderPlaced.payload).toMatchObject({ schemaFormat: AVRO });
  });

  /**
   * A model the provider cannot answer for stops the emit.
   *
   * Its payload would otherwise fall back to the schema its TypeSpec type
   * produces. That document answers a request for Avro with ordinary JSON
   * Schema, and nothing in the file says so.
   */
  it("writes no document when a record the document asks about is refused", async () => {
    const { doc, diagnostics } = await emit(`
      @service(#{ title: "Orders" })
      namespace Test;

      @Avro.\`namespace\`("com.example.orders")
      namespace Test.Orders {
        @message
        @Avro.\`record\`
        model OrderPlaced {
          anything: unknown;
        }
      }

      @channel("orders.placed")
      interface Placed {
        @send
        op placed(event: Test.Orders.OrderPlaced): void;
      }
    `);

    const reported = diagnosticsWith(diagnostics, "avro-artifact-unavailable");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");
    // The reason the walk gave is carried into this library's own message.
    expect(reported[0]?.message).toContain("OrderPlaced");
    expect(reported[0]?.message).toContain('The type "unknown" has no Avro form.');
    expect(doc).toBeNull();
  });

  /**
   * Two services and a refused record are two separate answers. The emitter
   * resolves the services before it stops, so a project hears about both from
   * one compile.
   */
  it("reports the extra service as well as the refused record", async () => {
    const { doc, diagnostics } = await emit(`
      @service(#{ title: "Orders" })
      @Avro.\`namespace\`("com.example.orders")
      namespace First {
        @message
        @Avro.\`record\`
        model OrderPlaced {
          anything: unknown;
        }

        @channel("orders.placed")
        interface Placed {
          @send
          op placed(event: OrderPlaced): void;
        }
      }

      @service(#{ title: "Shipping" })
      namespace Second {}
    `);

    expect(diagnosticsWith(diagnostics, "multiple-services")).toHaveLength(1);
    expect(diagnosticsWith(diagnostics, "avro-artifact-unavailable")).toHaveLength(1);
    expect(doc).toBeNull();
  });

  /**
   * An authored schema wins over a generated one, and the author is told.
   *
   * The four way priority is settled in `resolvePayload`, and this proves it
   * holds for Avro as well as for Protobuf.
   */
  it("keeps the payload the author wrote and reports the conflict once", async () => {
    const { doc, diagnostics } = await emit(`
      @service(#{ title: "Orders" })
      namespace Test;

      @Avro.\`namespace\`("com.example.orders")
      namespace Test.Orders {
        @message
        @rawPayload("${AVRO}", #{ type: "record", name: "Authored", fields: #[] })
        @Avro.\`record\`
        model OrderPlaced {
          orderId: string;
        }
      }

      @channel("orders.placed")
      interface Placed {
        @send
        op placed(event: Test.Orders.OrderPlaced): void;
      }
    `);

    expect(doc?.components?.messages?.OrderPlaced.payload).toEqual({
      schemaFormat: AVRO,
      schema: { type: "record", name: "Authored", fields: [] },
    });

    const reported = diagnosticsWith(diagnostics, "conflicting-message-schema-source");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("warning");
    expect(reported[0]?.message).toContain("avro");
  });
});
