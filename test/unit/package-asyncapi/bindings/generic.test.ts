import { describe, expect, it } from "vitest";
import { emitDocument, emitDocumentWithDiagnostics } from "../../../utils/test-host.js";
import { findDiagnostic, targetText } from "../../../utils/diagnostics.js";
import { listAllBindings } from "#core/decorators/bindings/state.js";
import {
  channelsOf,
  messagesOf,
  operationsOf,
  present,
  serversOf,
} from "../../../utils/document.js";
import { KAFKA_SERVICE } from "../../../utils/source.js";
import { bindingsOf } from "../../../utils/document.js";

describe("Unit: the generic @binding decorator", () => {
  it("emits the config verbatim on a channel, and adds no bindingVersion", async () => {
    const doc = await emitDocument(`
      ${KAFKA_SERVICE}

      @message
      model OrderCreated {
        id: string;
      }

      @binding("mqtt", #{ qos: 2, retain: true })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    expect(channelsOf(doc)["orders.created"].bindings).toEqual({ mqtt: { qos: 2, retain: true } });
  });

  it("reaches a server, an operation, and a message", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
      @binding("kafka", #{ schemaRegistryUrl: "https://registry.example.com" })
      namespace Test;

      @binding("googlepubsub", #{ orderingKey: "tenant" })
      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @binding("amqp", #{ expiration: 100 })
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    expect(serversOf(doc).prod.bindings).toEqual({
      kafka: { schemaRegistryUrl: "https://registry.example.com" },
    });
    expect(operationsOf(doc).publish.bindings).toEqual({ amqp: { expiration: 100 } });
    expect(messagesOf(doc).OrderCreated.bindings).toEqual({
      googlepubsub: { orderingKey: "tenant" },
    });
  });

  it("keeps every protocol of one target, in source order", async () => {
    const doc = await emitDocument(`
      ${KAFKA_SERVICE}

      @message
      model OrderCreated {
        id: string;
      }

      @binding("mqtt", #{ qos: 1 })
      @binding("amqp", #{ expiration: 100 })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    expect(
      Object.keys(present(channelsOf(doc)["orders.created"].bindings, "channel bindings")),
    ).toEqual(["mqtt", "amqp"]);
  });

  it("gives every server of the namespace its own copy of the binding", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
      @server("sit", #{ host: "kafka.sit.example.com:9092", protocol: "kafka" })
      @binding("kafka", #{ schemaRegistryUrl: "https://registry.example.com" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    // One decorator on the namespace reaches every server it declares, so
    // both carry the same Bindings Object, written once. The component is
    // named after the declaration that carries it, here the namespace.
    expect(doc.components?.serverBindings).toStrictEqual({
      Test: {
        kafka: { schemaRegistryUrl: "https://registry.example.com" },
      },
    });
    const reference = { $ref: "#/components/serverBindings/Test" };
    expect(serversOf(doc).prod.bindings).toStrictEqual(reference);
    expect(serversOf(doc).sit.bindings).toStrictEqual(reference);
  });

  it("lands at both levels when one namespace is the service and a channel", async () => {
    // The generic decorator names no level, so a namespace that emits a
    // server and a channel carries the binding on both objects.
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
      @channel("orders.created")
      @binding("mqtt", #{ qos: 1 })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @send
      op publish(event: OrderCreated): void;
    `);

    expect(serversOf(doc).prod.bindings).toEqual({ mqtt: { qos: 1 } });
    expect(channelsOf(doc)["orders.created"].bindings).toEqual({ mqtt: { qos: 1 } });
  });

  it("trims a padded protocol name before it becomes a member name", async () => {
    // The name is recorded trimmed, not raw, so the member key carries no
    // spaces the author typed around it.
    const doc = await emitDocument(`
      ${KAFKA_SERVICE}

      @message
      model OrderCreated {
        id: string;
      }

      @binding("  mqtt  ", #{ qos: 1 })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    expect(
      Object.keys(present(channelsOf(doc)["orders.created"].bindings, "channel bindings")),
    ).toEqual(["mqtt"]);
  });

  it("reports a blank protocol name and drops the binding", async () => {
    const { doc, diagnostics, program } = await emitDocumentWithDiagnostics(`
      ${KAFKA_SERVICE}

      @message
      model OrderCreated {
        id: string;
      }

      @binding("  ", #{ qos: 1 })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, "empty-binding-protocol");
    expect(targetText(reported)).toBe(`"  "`);
    // The diagnostic is an error, so the emitter never writes a document.
    expect(doc).toBeNull();
    // The document is not written here, so the state is the only place that
    // can confirm nothing was recorded for the blank protocol name.
    expect(listAllBindings(program)).toEqual([]);
  });

  it("reports a config that is not an object and drops the binding", async () => {
    const { doc, diagnostics, program } = await emitDocumentWithDiagnostics(`
      ${KAFKA_SERVICE}

      @message
      model OrderCreated {
        id: string;
      }

      @binding("mqtt", "qos=1")
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, "invalid-binding-config");
    expect(targetText(reported)).toBe(`"qos=1"`);
    expect(doc).toBeNull();
    // The rejected config must not be recorded either. See the case above.
    expect(listAllBindings(program)).toEqual([]);
  });

  it("reports an array config, because a Bindings Object member is an object", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${KAFKA_SERVICE}

      @message
      model OrderCreated {
        id: string;
      }

      @binding("mqtt", #[1, 2])
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, "invalid-binding-config");
    expect(reported.message).toContain("mqtt");
  });

  it("reports one protocol claimed twice on one target, and keeps the first", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      ${KAFKA_SERVICE}

      @message
      model OrderCreated {
        id: string;
      }

      @binding("mqtt", #{ qos: 1 })
      @binding("mqtt", #{ qos: 2 })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, "duplicate-binding");
    expect(reported.message).toContain("mqtt");
    // The message names the position the member sits at. `@binding` names no
    // level, so the level the builder was asked for is the one to report.
    expect(reported.message).toContain("at the channel level");
    // The first application in source order keeps the member.
    expect(bindingsOf(channelsOf(doc)["orders.created"].bindings).mqtt).toEqual({ qos: 1 });
  });

  it("reports the dropped duplicate once, and not again as unattached", async () => {
    // The dropped binding did reach the channel. Reporting it a second time
    // as a binding that reaches nothing would state the opposite.
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${KAFKA_SERVICE}

      @message
      model OrderCreated {
        id: string;
      }

      @kafkaChannel(#{ topic: "a" })
      @binding("kafka", #{ topic: "b" })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const codes = diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toContain("tsp-asyncapi/duplicate-binding");
    expect(codes).not.toContain("tsp-asyncapi/binding-outside-document");
  });

  it("reports a binding whose target emits no object", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${KAFKA_SERVICE}

      @message
      model OrderCreated {
        id: string;
      }

      @binding("mqtt", #{ qos: 1 })
      interface NotAChannel {
        op publish(event: OrderCreated): void;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, "binding-outside-document");
    expect(reported.message).toContain("mqtt");
  });

  it("serializes a scalar the compiler does not flatten", async () => {
    const doc = await emitDocument(`
      ${KAFKA_SERVICE}

      @message
      model OrderCreated {
        id: string;
      }

      @binding("mqtt", #{ since: utcDateTime.fromISO("2026-01-01T00:00:00Z") })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    expect(bindingsOf(channelsOf(doc)["orders.created"].bindings).mqtt.since).toBe(
      "2026-01-01T00:00:00Z",
    );
  });
  it("converts a nested object, a list, and a null through the same rule", async () => {
    const doc = await emitDocument(`
      ${KAFKA_SERVICE}

      @message
      model OrderCreated {
        id: string;
      }

      @binding(
        "mqtt",
        #{ will: #{ topic: "down", qos: 1 }, hops: #[1, 2, 3], lastSeen: null }
      )
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    expect(bindingsOf(channelsOf(doc)["orders.created"].bindings).mqtt).toEqual({
      will: { topic: "down", qos: 1 },
      hops: [1, 2, 3],
      lastSeen: null,
    });
  });

  it("serializes an unflattened scalar that sits inside a list", async () => {
    // Only an unflattened value shows that the conversion reaches inside a
    // list. A plain number would pass through either way.
    const doc = await emitDocument(`
      ${KAFKA_SERVICE}

      @message
      model OrderCreated {
        id: string;
      }

      @binding("mqtt", #{ seen: #[utcDateTime.fromISO("2026-01-01T00:00:00Z")] })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    expect(bindingsOf(channelsOf(doc)["orders.created"].bindings).mqtt.seen).toEqual([
      "2026-01-01T00:00:00Z",
    ]);
  });
});
