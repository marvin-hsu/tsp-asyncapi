/**
 * This suite locks the document-skeleton, info, message, and security shapes
 * that an end-to-end compile produces.
 */

import { describe, it, expect } from "vitest";
import { $lib } from "#core/lib.js";
import { emitDocument, emitDocumentWithDiagnostics } from "../utils/test-host.js";
import { byCodePoint } from "../utils/sort.js";
import {
  externalDocsOf,
  infoOf,
  messagesOf,
  present,
  resolveTags,
  schemaOf,
  schemasOf,
  securitySchemesOf,
  serversOf,
} from "../utils/document.js";

describe("AsyncAPI Emitter", () => {
  it("should have correct library name", () => {
    expect($lib.name).toBe("tsp-asyncapi");
  });

  it("should output basic asyncapi 3.1.0 document (YAML by default)", async () => {
    const code = ``;
    const doc = await emitDocument(code);
    expect(doc.asyncapi).toBe("3.1.0");
    expect(infoOf(doc).title).toBe("TestService");
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should output JSON when file-type is json", async () => {
    const code = ``;
    const doc = await emitDocument(code, { "file-type": "json" });
    expect(doc.asyncapi).toBe("3.1.0");
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should output to custom file name", async () => {
    const code = ``;
    const doc = await emitDocument(code, { "output-file": "custom.yaml" });
    expect(doc.asyncapi).toBe("3.1.0");
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should output diagnostic on multiple services", async () => {
    const code = `
      namespace S1 { @service(#{ title: "Service 1" }) namespace Inner1 {} }
      namespace S2 { @service(#{ title: "Service 2" }) namespace Inner2 {} }
    `;
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(code, {}, false);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe("tsp-asyncapi/multiple-services");
    expect(infoOf(doc).title).toBe("Service 1");
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should output fallback document when no service is provided", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics("", {}, false);
    expect(diagnostics).toHaveLength(0);
    expect(infoOf(doc).title).toBe("AsyncAPI Document");
    await expect(doc).toBeValidAsyncAPI();
  });
});

describe("Phase 1: Document Skeleton & Info", () => {
  it("should extract title from @service", async () => {
    const code = `@service(#{ title: "Order Events" }) namespace Orders;`;
    const doc = await emitDocument(code);
    expect(infoOf(doc).title).toBe("Order Events");
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should throw error when @info is applied to a model", async () => {
    const code = `
      @service(#{ title: "My Service" }) namespace Test;
      @AsyncAPI.info(#{ version: "1.0.0" })
      model InvalidTarget {}
    `;
    const { diagnostics } = await emitDocumentWithDiagnostics(code);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].code).toBe("decorator-wrong-target");
  });

  it("should fallback version to 0.0.0 without @info", async () => {
    const code = `@service(#{ title: "Order Events" }) namespace Orders;`;
    const doc = await emitDocument(code);
    expect(infoOf(doc).version).toBe("0.0.0");
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should extract full info from @info", async () => {
    const code = `
      @service(#{ title: "Order Events" })
      @AsyncAPI.info(#{
        version: "1.2.3",
        description: "Order system events",
        termsOfService: "https://example.com/terms",
        contact: #{ name: "API Team", email: "team@example.com" },
        license: #{ name: "MIT", url: "https://mit.edu" }
      })
      namespace Orders;
    `;
    const doc = await emitDocument(code);
    expect(infoOf(doc).version).toBe("1.2.3");
    expect(infoOf(doc).description).toBe("Order system events");
    expect(infoOf(doc).termsOfService).toBe("https://example.com/terms");
    expect(infoOf(doc).contact?.name).toBe("API Team");
    expect(infoOf(doc).license?.name).toBe("MIT");
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should extract tags and externalDocs", async () => {
    const code = `
      @service(#{ title: "Order Events" })
      @tag("orders")
      @tag("events")
      @AsyncAPI.externalDocs("https://example.com/docs", "Docs")
      namespace Orders;
    `;
    const doc = await emitDocument(code);
    // Each tag carries the name its author wrote, so each is written once in
    // `components.tags` and `info` points at it.
    expect(resolveTags(doc, infoOf(doc).tags)).toEqual([{ name: "events" }, { name: "orders" }]);
    expect(externalDocsOf(infoOf(doc).externalDocs).url).toBe("https://example.com/docs");
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should set id and defaultContentType from options", async () => {
    const code = ``;
    const doc = await emitDocument(code, {
      "asyncapi-id": "urn:com:example:events",
      "default-content-type": "application/json",
    });
    expect(doc.id).toBe("urn:com:example:events");
    expect(doc.defaultContentType).toBe("application/json");
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should emit servers, messages, and schemas that the parser accepts", async () => {
    // The cases above only reach the document skeleton and `info`. This one
    // drives every section the emitter fills today at once. It is the case
    // that puts `components.messages`, `components.schemas`, and the `$ref`
    // between them in front of the official parser.
    const code = `
      @service(#{ title: "Order Events" })
      @AsyncAPI.server("production", #{
        host: "kafka.example.com:9092",
        protocol: "kafka",
        protocolVersion: "3.5.0"
      })
      @AsyncAPI.server("sit", #{ host: "kafka.sit.example.com:9092", protocol: "kafka" })
      namespace Orders;

      model OrderItem {
        productId: string;
        quantity: int32;
      }

      @AsyncAPI.message
      model OrderPlaced {
        id: string;
        amount: float64;
        items: OrderItem[];
      }
    `;
    const doc = await emitDocument(code);

    expect(Object.keys(serversOf(doc))).toEqual(["production", "sit"]);
    expect(Object.keys(messagesOf(doc))).toEqual(["OrderPlaced"]);
    expect(messagesOf(doc).OrderPlaced.payload).toEqual({
      $ref: "#/components/schemas/OrderPlaced",
    });
    // `OrderItem` has no `@message` of its own. It reaches the document only
    // because the `OrderPlaced` payload refers to it.
    expect(Object.keys(schemasOf(doc)).sort(byCodePoint)).toEqual(["OrderItem", "OrderPlaced"]);

    await expect(doc).toBeValidAsyncAPI();
  });

  it("should emit message headers that the parser accepts", async () => {
    // Both header mechanisms in one document. `OrderPlaced` lifts two flat
    // fields out of its payload. `OrderShipped` names a nested headers model
    // of its own. The parser checks that both land in a `headers` schema it
    // accepts, and the assertions check that the payload component of
    // `OrderPlaced` no longer describes the lifted fields.
    const code = `
      @service(#{ title: "Order Events" })
      namespace Orders;

      model MqmdFields {
        CorrelId: string;
      }

      model ShippingHeaders {
        MQMD: MqmdFields;
      }

      @AsyncAPI.message
      model OrderPlaced {
        @AsyncAPI.header
        correlationId: string;

        @AsyncAPI.header
        @encodedName("application/json", "x-retry-count")
        retryCount?: int32;

        id: string;
        amount: float64;
      }

      @AsyncAPI.message
      @AsyncAPI.headers(ShippingHeaders)
      model OrderShipped {
        id: string;
      }
    `;
    const doc = await emitDocument(code);

    expect(messagesOf(doc).OrderPlaced.headers).toEqual({
      type: "object",
      properties: {
        correlationId: { type: "string" },
        "x-retry-count": { type: "integer", format: "int32" },
      },
      required: ["correlationId"],
    });
    // The lifting message points at a payload component of its own, and that
    // component holds the fields that stayed behind.
    expect(messagesOf(doc).OrderPlaced.payload).toEqual({
      $ref: "#/components/schemas/OrderPlacedPayload",
    });
    expect(
      Object.keys(
        present(
          schemaOf(schemasOf(doc).OrderPlacedPayload).properties,
          "OrderPlacedPayload properties",
        ),
      ).sort(byCodePoint),
    ).toEqual(["amount", "id"]);
    expect(messagesOf(doc).OrderShipped.headers).toEqual({
      $ref: "#/components/schemas/ShippingHeaders",
    });
    // `OrderShipped` lifts nothing, so its payload stays its own model.
    expect(messagesOf(doc).OrderShipped.payload).toEqual({
      $ref: "#/components/schemas/OrderShipped",
    });
    expect(Object.keys(schemasOf(doc)).sort(byCodePoint)).toEqual([
      "MqmdFields",
      "OrderPlacedPayload",
      "OrderShipped",
      "ShippingHeaders",
    ]);

    await expect(doc).toBeValidAsyncAPI();
  });

  it("should emit a correlationId and message examples that the parser accepts", async () => {
    // A real-shaped Kafka message: lifted headers, a payload, a correlation
    // id that points into those headers, and two named examples. The parser
    // checks the Correlation ID Object and the Message Example Objects, the
    // two shapes the assertions below cannot validate on their own.
    const code = `
      @service(#{ title: "Order Events" })
      namespace Orders;

      @AsyncAPI.message
      @AsyncAPI.contentType("application/json")
      @AsyncAPI.correlationId("$message.header#/correlationId", "Ties a reply to its request.")
      @AsyncAPI.messageExample(
        #{
          headers: #{ correlationId: "abc-123" },
          payload: #{ id: "o-1", amount: 12.5 }
        },
        #{ name: "smallOrder", summary: "One line, already paid." }
      )
      @AsyncAPI.messageExample(
        #{ payload: #{ id: "o-2", amount: 999.0 } },
        #{ name: "largeOrder" }
      )
      model OrderPlaced {
        @AsyncAPI.header
        correlationId: string;

        id: string;
        amount: float64;
      }
    `;
    const doc = await emitDocument(code);

    expect(messagesOf(doc).OrderPlaced.correlationId).toEqual({
      location: "$message.header#/correlationId",
      description: "Ties a reply to its request.",
    });
    expect(messagesOf(doc).OrderPlaced.examples).toEqual([
      {
        name: "smallOrder",
        summary: "One line, already paid.",
        headers: { correlationId: "abc-123" },
        payload: { id: "o-1", amount: 12.5 },
      },
      { name: "largeOrder", payload: { id: "o-2", amount: 999 } },
    ]);

    await expect(doc).toBeValidAsyncAPI();
  });

  it("should emit every accepted correlationId fragment shape", async () => {
    // The normative AsyncAPI JSON Schema requires the `#`, and it accepts an
    // empty pointer after it as well as a multi-level one. Both extremes go
    // through the parser here, because the emitter's own regex is the only
    // other place that decides which shapes reach the document.
    const code = `
      @service(#{ title: "Order Events" })
      namespace Orders;

      @AsyncAPI.message
      @AsyncAPI.correlationId("$message.header#")
      model WholeHeader {
        id: string;
      }

      @AsyncAPI.message
      @AsyncAPI.correlationId("$message.header#/MQMD/CorrelId")
      model NestedPointer {
        id: string;
      }
    `;
    const doc = await emitDocument(code);

    expect(messagesOf(doc).WholeHeader.correlationId).toEqual({
      location: "$message.header#",
    });
    expect(messagesOf(doc).NestedPointer.correlationId).toEqual({
      location: "$message.header#/MQMD/CorrelId",
    });

    await expect(doc).toBeValidAsyncAPI();
  });

  it("should emit message tags and externalDocs that the parser accepts", async () => {
    // The parser checks the Tag Object and the External Documentation Object
    // on a message, the two shapes 3.6 adds. `info.tags` carries a tag of the
    // same name with its own metadata, which the spec allows: each object
    // holds its own independent `tags` array.
    const code = `
      @service(#{ title: "Order Events" })
      @tag("orders")
      @AsyncAPI.asyncTag("orders", #{ description: "The order domain as a whole." })
      namespace Orders;

      @AsyncAPI.message
      @AsyncAPI.asyncTag("orders", #{
        description: "Emitted by the order service.",
        externalDocs: #{ url: "https://example.com/orders", description: "The order guide." }
      })
      @AsyncAPI.asyncTag("public")
      @AsyncAPI.externalDocs("https://example.com/order-placed", "How to consume this message.")
      model OrderPlaced {
        id: string;
      }
    `;
    const doc = await emitDocument(code);

    expect(infoOf(doc).tags).toEqual([
      { name: "orders", description: "The order domain as a whole." },
    ]);
    // Two Tag Objects named `orders` differ in their description, so they
    // are two fragments asking for one key. Neither is shared: `info` and the
    // message each write their own. `public` has no rival, so it is shared.
    expect(messagesOf(doc).OrderPlaced.tags).toEqual([
      {
        name: "orders",
        description: "Emitted by the order service.",
        externalDocs: {
          url: "https://example.com/orders",
          description: "The order guide.",
        },
      },
      { $ref: "#/components/tags/public" },
    ]);
    expect(messagesOf(doc).OrderPlaced.externalDocs).toEqual({
      url: "https://example.com/order-placed",
      description: "How to consume this message.",
    });

    await expect(doc).toBeValidAsyncAPI();
  });

  it("should emit security schemes, server security, and variables that the parser accepts", async () => {
    // The three parts of the server security story only meet here. The
    // parser resolves the `$ref` from a server into `components`, and it
    // checks the substitution of a variable into `host` and `pathname`.
    const code = `
      @service(#{ title: "Order Events" })
      @AsyncAPI.securityScheme("kafka-scram", #{
        type: "scramSha512",
        description: "SASL/SCRAM over TLS."
      })
      @AsyncAPI.securityScheme("oauth", #{
        type: "oauth2",
        scopes: #["orders:read"],
        flows: #{
          clientCredentials: #{
            tokenUrl: "https://example.com/token",
            refreshUrl: "https://example.com/refresh",
            availableScopes: #{ \`orders:read\`: "Read orders" }
          }
        }
      })
      @AsyncAPI.useSecurity("kafka-scram")
      @AsyncAPI.useSecurity("oauth")
      @AsyncAPI.server("production", #{
        host: "{tenant}.kafka.example.com:9092",
        protocol: "kafka-secure",
        protocolVersion: "3.5.0",
        pathname: "/{stage}",
        variables: #{
          tenant: #{ default: "acme", \`enum\`: #["acme", "globex"], description: "The tenant." },
          stage: #{ default: "v1", examples: #["v1"] }
        }
      })
      namespace Orders;
    `;
    const doc = await emitDocument(code);

    expect(serversOf(doc).production.security).toEqual([
      { $ref: "#/components/securitySchemes/kafka-scram" },
      { $ref: "#/components/securitySchemes/oauth" },
    ]);
    expect(Object.keys(present(serversOf(doc).production.variables, "server variables"))).toEqual([
      "tenant",
      "stage",
    ]);
    expect(Object.keys(securitySchemesOf(doc)).sort(byCodePoint)).toEqual(["kafka-scram", "oauth"]);

    await expect(doc).toBeValidAsyncAPI();
  });
});
