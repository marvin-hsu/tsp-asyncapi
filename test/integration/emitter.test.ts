/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect } from "vitest";
import { $lib } from "../../src/lib.js";
import { emitAsyncAPI, emitAsyncAPIWithDiagnostics } from "../utils/test-host.js";
import { byCodePoint } from "../utils/sort.js";

describe("AsyncAPI Emitter", () => {
  it("should have correct library name", () => {
    expect($lib.name).toBe("tsp-asyncapi");
  });

  it("should output basic asyncapi 3.1.0 document (YAML by default)", async () => {
    const code = ``;
    const doc = await emitAsyncAPI(code);
    expect(doc.asyncapi).toBe("3.1.0");
    expect(doc.info.title).toBe("TestService");
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should output JSON when file-type is json", async () => {
    const code = ``;
    const doc = await emitAsyncAPI(code, { "file-type": "json" });
    expect(doc.asyncapi).toBe("3.1.0");
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should output to custom file name", async () => {
    const code = ``;
    const doc = await emitAsyncAPI(code, { "output-file": "custom.yaml" });
    expect(doc.asyncapi).toBe("3.1.0");
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should output diagnostic on multiple services", async () => {
    const code = `
      namespace S1 { @service(#{ title: "Service 1" }) namespace Inner1 {} }
      namespace S2 { @service(#{ title: "Service 2" }) namespace Inner2 {} }
    `;
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(code, {}, false);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe("tsp-asyncapi/multiple-services");
    expect(doc.info.title).toBe("Service 1");
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should output fallback document when no service is provided", async () => {
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics("", {}, false);
    expect(diagnostics).toHaveLength(0);
    expect(doc.info.title).toBe("AsyncAPI Document");
    await expect(doc).toBeValidAsyncAPI();
  });
});

describe("Phase 1: Document Skeleton & Info", () => {
  it("should extract title from @service", async () => {
    const code = `@service(#{ title: "Order Events" }) namespace Orders;`;
    const doc = await emitAsyncAPI(code);
    expect(doc.info.title).toBe("Order Events");
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should throw error when @info is applied to a model", async () => {
    const code = `
      @service(#{ title: "My Service" }) namespace Test;
      @AsyncAPI.info(#{ version: "1.0.0" })
      model InvalidTarget {}
    `;
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(code);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].code).toBe("decorator-wrong-target");
  });

  it("should fallback version to 0.0.0 without @info", async () => {
    const code = `@service(#{ title: "Order Events" }) namespace Orders;`;
    const doc = await emitAsyncAPI(code);
    expect(doc.info.version).toBe("0.0.0");
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
    const doc = await emitAsyncAPI(code);
    expect(doc.info.version).toBe("1.2.3");
    expect(doc.info.description).toBe("Order system events");
    expect(doc.info.termsOfService).toBe("https://example.com/terms");
    expect(doc.info.contact?.name).toBe("API Team");
    expect(doc.info.license?.name).toBe("MIT");
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
    const doc = await emitAsyncAPI(code);
    expect(doc.info.tags).toHaveLength(2);
    expect(doc.info.tags).toContainEqual({ name: "orders" });
    expect(doc.info.tags).toContainEqual({ name: "events" });
    expect(doc.info.externalDocs?.url).toBe("https://example.com/docs");
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should set id and defaultContentType from options", async () => {
    const code = ``;
    const doc = await emitAsyncAPI(code, {
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
    const doc = await emitAsyncAPI(code);

    expect(Object.keys(doc.servers)).toEqual(["production", "sit"]);
    expect(Object.keys(doc.components.messages)).toEqual(["OrderPlaced"]);
    expect(doc.components.messages.OrderPlaced.payload).toEqual({
      $ref: "#/components/schemas/OrderPlaced",
    });
    // `OrderItem` has no `@message` of its own. It reaches the document only
    // because the `OrderPlaced` payload refers to it.
    expect(Object.keys(doc.components.schemas).sort(byCodePoint)).toEqual([
      "OrderItem",
      "OrderPlaced",
    ]);

    await expect(doc).toBeValidAsyncAPI();
  });
});
