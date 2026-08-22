import { describe, expect, it } from "vitest";
import { emitDocument, emitDocumentWithDiagnostics } from "../../../utils/test-host.js";
import { findDiagnostic, targetText } from "../../../utils/diagnostics.js";
import { messagesOf } from "../../../utils/document.js";

const SERVICE = `
  @service(#{ title: "Orders" })
  @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
  namespace Test;
`;

const CHANNEL = `
  @channel("orders.created")
  interface OrderChannel {
    @send
    op publish(event: OrderCreated): void;
  }
`;

describe("Unit: the @kafkaMessage decorator", () => {
  it("emits every field with the binding version", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @kafkaMessage(#{
        key: #{ type: "string" },
        schemaIdLocation: "payload",
        schemaIdPayloadEncoding: "apicurio-new",
        schemaLookupStrategy: "TopicIdStrategy",
      })
      @message
      model OrderCreated {
        id: string;
      }

      ${CHANNEL}
    `);

    expect(messagesOf(doc).OrderCreated.bindings).toEqual({
      kafka: {
        key: { type: "string" },
        schemaIdLocation: "payload",
        schemaIdPayloadEncoding: "apicurio-new",
        schemaLookupStrategy: "TopicIdStrategy",
        bindingVersion: "0.5.0",
      },
    });
  });

  it("accepts a header schema id location", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @kafkaMessage(#{ schemaIdLocation: "header" })
      @message
      model OrderCreated {
        id: string;
      }

      ${CHANNEL}
    `);

    expect(messagesOf(doc).OrderCreated.bindings?.kafka.schemaIdLocation).toBe("header");
  });

  it("reports a schema id location outside the two the binding allows", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @kafkaMessage(#{ schemaIdLocation: "trailer", schemaLookupStrategy: "TopicIdStrategy" })
      @message
      model OrderCreated {
        id: string;
      }

      ${CHANNEL}
    `);

    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
    expect(reported.message).toContain("schemaIdLocation");
    expect(reported.message).toContain("header or payload");
    // The squiggle sits on the config literal, not on the whole model.
    expect(targetText(reported)).toBe(
      `#{ schemaIdLocation: "trailer", schemaLookupStrategy: "TopicIdStrategy" }`,
    );
    // The rejected field is dropped, and the rest of the binding is emitted.
    expect(messagesOf(doc).OrderCreated.bindings?.kafka).toEqual({
      schemaLookupStrategy: "TopicIdStrategy",
      bindingVersion: "0.5.0",
    });
  });

  it("reports a key that is not a schema object", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @kafkaMessage(#{ key: 42, schemaIdLocation: "payload" })
      @message
      model OrderCreated {
        id: string;
      }

      ${CHANNEL}
    `);

    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
    expect(reported.message).toContain("key");
    expect(messagesOf(doc).OrderCreated.bindings?.kafka).toEqual({
      schemaIdLocation: "payload",
      bindingVersion: "0.5.0",
    });
  });

  it("reports a model that carries no @message", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @kafkaMessage(#{ key: #{ type: "string" } })
      model NotAMessage {
        id: string;
      }

      @message
      model OrderCreated {
        id: string;
      }

      ${CHANNEL}
    `);

    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/binding-outside-document");
    expect(reported.message).toContain("kafka");
    expect(reported.message).toContain("for the message level");
  });

  it("reports a generic @binding that claims the kafka member at this level", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @kafkaMessage(#{ key: #{ type: "string" } })
      @binding("kafka", #{ schemaIdLocation: "header" })
      @message
      model OrderCreated {
        id: string;
      }

      ${CHANNEL}
    `);

    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/duplicate-binding");
    expect(reported.message).toContain("kafka");
    expect(reported.message).toContain("at the message level");
  });
  it("emits the version alone when every field is left out", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @kafkaMessage(#{})
      @message
      model OrderCreated {
        id: string;
      }

      ${CHANNEL}
    `);

    expect(messagesOf(doc).OrderCreated.bindings).toEqual({
      kafka: { bindingVersion: "0.5.0" },
    });
  });

  it("trims a padded schema id location before it is checked", async () => {
    // The allowed set holds `header` and `payload`. The value is trimmed
    // first, so spacing around the word does not turn a legal location into
    // a rejected one.
    const doc = await emitDocument(`
      ${SERVICE}

      @kafkaMessage(#{ schemaIdLocation: " payload " })
      @message
      model OrderCreated {
        id: string;
      }

      ${CHANNEL}
    `);

    expect(messagesOf(doc).OrderCreated.bindings?.kafka.schemaIdLocation).toBe("payload");
  });

  it("drops a blank schema lookup strategy rather than emitting an empty value", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @kafkaMessage(#{ schemaLookupStrategy: "  ", schemaIdPayloadEncoding: " confluent " })
      @message
      model OrderCreated {
        id: string;
      }

      ${CHANNEL}
    `);

    expect(messagesOf(doc).OrderCreated.bindings).toEqual({
      kafka: { schemaIdPayloadEncoding: "confluent", bindingVersion: "0.5.0" },
    });
  });
});
