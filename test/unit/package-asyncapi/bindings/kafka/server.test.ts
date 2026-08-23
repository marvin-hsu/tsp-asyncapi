import { describe, expect, it } from "vitest";
import { emitDocument, emitDocumentWithDiagnostics } from "../../../../utils/test-host.js";
import { serversOf } from "../../../../utils/document.js";
import { findDiagnostic } from "../../../../utils/diagnostics.js";

/** The message and channel every case needs, so a document is emitted. */
const CONTRACT = `
  @message
  model OrderCreated {
    id: string;
  }

  @channel("orders.created")
  interface OrderChannel {
    @send
    op publish(event: OrderCreated): void;
  }
`;

describe("Unit: the @kafkaServer decorator", () => {
  it("emits the binding with its version on every server of the namespace", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
      @server("sit", #{ host: "kafka.sit.example.com:9092", protocol: "kafka" })
      @kafkaServer(#{
        schemaRegistryUrl: "https://registry.example.com",
        schemaRegistryVendor: "confluent",
      })
      namespace Test;

      ${CONTRACT}
    `);

    const expected = {
      kafka: {
        schemaRegistryUrl: "https://registry.example.com",
        schemaRegistryVendor: "confluent",
        bindingVersion: "0.5.0",
      },
    };
    expect(serversOf(doc).prod.bindings).toEqual(expected);
    expect(serversOf(doc).sit.bindings).toEqual(expected);
  });

  it("emits the version alone when every field is left out", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
      @kafkaServer(#{})
      namespace Test;

      ${CONTRACT}
    `);

    expect(serversOf(doc).prod.bindings).toEqual({ kafka: { bindingVersion: "0.5.0" } });
  });

  it("drops a blank field rather than emitting an empty value", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
      @kafkaServer(#{ schemaRegistryUrl: "  ", schemaRegistryVendor: " apicurio " })
      namespace Test;

      ${CONTRACT}
    `);

    expect(serversOf(doc).prod.bindings).toEqual({
      kafka: { schemaRegistryVendor: "apicurio", bindingVersion: "0.5.0" },
    });
  });

  it("reports a namespace that declares no server", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      namespace Test;

      @kafkaServer(#{ schemaRegistryUrl: "https://registry.example.com" })
      namespace Other {}

      ${CONTRACT}
    `);

    const reported = findDiagnostic(diagnostics, "binding-outside-document");
    expect(reported.message).toContain("kafka");
    // The message names the document position the author has to look at.
    expect(reported.message).toContain("for the server level");
  });

  it("reports a generic @binding that claims the kafka member at this level", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
      @kafkaServer(#{ schemaRegistryUrl: "https://registry.example.com" })
      @binding("kafka", #{ schemaRegistryUrl: "https://other.example.com" })
      namespace Test;

      ${CONTRACT}
    `);

    const reported = findDiagnostic(diagnostics, "duplicate-binding");
    expect(reported.message).toContain("kafka");
    expect(reported.message).toContain("at the server level");
  });
});
