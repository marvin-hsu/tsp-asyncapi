import { describe, expect, it } from "vitest";
import { emitDocument, emitDocumentWithDiagnostics } from "../../../../utils/test-host.js";
import { findDiagnostic, targetText } from "../../../../utils/diagnostics.js";
import { channelsOf, present, serversOf } from "../../../../utils/document.js";
import { bindingsOf } from "../../../../utils/document.js";

const SERVICE = `
  @service(#{ title: "Orders" })
  @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
  namespace Test;

  @message
  model OrderCreated {
    id: string;
  }
`;

describe("Unit: the @kafkaChannel decorator", () => {
  it("emits every field with the binding version", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @kafkaChannel(#{
        topic: "orders.created.v2",
        partitions: 12,
        replicas: 3,
        topicConfiguration: #{ \`cleanup.policy\`: #["compact"], \`retention.ms\`: 604800000 },
      })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    expect(channelsOf(doc)["orders.created"].bindings).toEqual({
      kafka: {
        topic: "orders.created.v2",
        partitions: 12,
        replicas: 3,
        topicConfiguration: { "cleanup.policy": ["compact"], "retention.ms": 604800000 },
        bindingVersion: "0.5.0",
      },
    });
  });

  it("keeps a vendor key with dots inside topicConfiguration", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @kafkaChannel(#{
        topicConfiguration: #{ \`confluent.value.schema.validation\`: true },
      })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    expect(bindingsOf(channelsOf(doc)["orders.created"].bindings).kafka.topicConfiguration).toEqual(
      {
        "confluent.value.schema.validation": true,
      },
    );
  });

  it("reaches a namespace channel as well as an interface channel", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @kafkaChannel(#{ topic: "orders.created" })
      @channel("orders.created")
      namespace OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    expect(bindingsOf(channelsOf(doc)["orders.created"].bindings).kafka.topic).toBe(
      "orders.created",
    );
  });

  it("reports a partition count that is not positive, and keeps the rest", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @kafkaChannel(#{ topic: "orders.created", partitions: 0, replicas: 3 })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("partitions");
    expect(reported.message).toContain("a positive integer");
    // The message promises the rest of the binding survives, so the document
    // has to be there to show it. The rejected field is the only loss.
    expect(bindingsOf(channelsOf(doc)["orders.created"].bindings).kafka).toEqual({
      topic: "orders.created",
      replicas: 3,
      bindingVersion: "0.5.0",
    });
  });

  it("drops a blank topic rather than emitting one", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @kafkaChannel(#{ topic: "   ", partitions: 3 })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    // A blank topic names nothing, and emitting it would claim the channel
    // uses a topic whose name is spaces.
    expect(bindingsOf(channelsOf(doc)["orders.created"].bindings).kafka).toEqual({
      partitions: 3,
      bindingVersion: "0.5.0",
    });
  });

  it("trims a padded topic", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @kafkaChannel(#{ topic: "  orders.created  " })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    expect(bindingsOf(channelsOf(doc)["orders.created"].bindings).kafka.topic).toBe(
      "orders.created",
    );
  });

  it("reports a replica count that is negative", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @kafkaChannel(#{ replicas: -1 })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("replicas");
    // The message names the protocol as well as the field. One code covers
    // every binding, so the protocol is the half that says which one.
    expect(reported.message).toContain("kafka binding field");
    // The squiggle sits on the config literal, not on the whole interface.
    // The author has to look at the value, and the declaration around it can
    // run for many lines.
    expect(targetText(reported)).toBe("#{ replicas: -1 }");
  });

  it("reports a cleanup policy outside the two values Kafka allows", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @kafkaChannel(#{ topicConfiguration: #{ \`cleanup.policy\`: #["archive"] } })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("cleanup.policy");
    expect(reported.message).toContain("delete or compact");
  });

  it("reports a topic configuration the serializer cannot represent", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      scalar ipv4 extends string {
        init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
      }

      @kafkaChannel(#{
        topic: "orders",
        topicConfiguration: #{ \`vendor.host\`: Test.ipv4.fromBytes(1, 2, 3, 4) },
      })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    // One member the serializer cannot represent fails the whole map. The
    // field is reported and dropped, and the rest of the binding is kept.
    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("topicConfiguration");
    expect(reported.message).toContain("an object");
    expect(bindingsOf(channelsOf(doc)["orders.created"].bindings).kafka).toEqual({
      topic: "orders",
      bindingVersion: "0.5.0",
    });
  });

  it("keeps the rest of the topic configuration when the cleanup policy is rejected", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @kafkaChannel(#{
        topic: "orders",
        topicConfiguration: #{
          \`cleanup.policy\`: #["archive"],
          \`retention.ms\`: 604800000,
          \`confluent.value.schema.validation\`: true
        }
      })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    // One bad value drops only that field. Keys the author wrote correctly,
    // including a vendor key this emitter has never heard of, stay.
    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/invalid-binding-field");
    expect(bindingsOf(doc?.channels?.["orders.created"]?.bindings).kafka).toEqual({
      topic: "orders",
      topicConfiguration: {
        "retention.ms": 604800000,
        "confluent.value.schema.validation": true,
      },
      bindingVersion: "0.5.0",
    });
  });

  it("accepts both values Kafka allows in the cleanup policy", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @kafkaChannel(#{ topicConfiguration: #{ \`cleanup.policy\`: #["delete", "compact"] } })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    expect(bindingsOf(channelsOf(doc)["orders.created"].bindings).kafka.topicConfiguration).toEqual(
      {
        "cleanup.policy": ["delete", "compact"],
      },
    );
  });

  it("reports a plain interface that carries no channel", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @kafkaChannel(#{ topic: "orders.created" })
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
    expect(reported.message).toContain("kafka");
    expect(reported.message).toContain("for the channel level");
  });

  it("reports a second application on one channel", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @kafkaChannel(#{ topic: "one" })
      @kafkaChannel(#{ topic: "two" })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, "duplicate-binding");
    expect(reported.message).toContain("kafka");
    expect(reported.message).toContain("at the channel level");
  });

  it("keeps a generic binding for another protocol beside the kafka one", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @kafkaChannel(#{ topic: "orders.created" })
      @binding("mqtt", #{ qos: 1 })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    expect(
      Object.keys(present(channelsOf(doc)["orders.created"].bindings, "channel bindings")).sort(
        (a: string, b: string) => a.localeCompare(b),
      ),
    ).toEqual(["kafka", "mqtt"]);
  });
  it("drops an empty topic configuration rather than emitting an empty object", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @kafkaChannel(#{ topicConfiguration: #{} })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    expect(channelsOf(doc)["orders.created"].bindings).toEqual({
      kafka: { bindingVersion: "0.5.0" },
    });
  });

  it("emits a cleanup policy written as one value as a one-entry list", async () => {
    // The Kafka binding types this field as an array. A bare string is
    // accepted from the author and written as the list the parser expects.
    const doc = await emitDocument(`
      ${SERVICE}

      @kafkaChannel(#{ topicConfiguration: #{ \`cleanup.policy\`: "compact" } })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    expect(bindingsOf(channelsOf(doc)["orders.created"].bindings).kafka.topicConfiguration).toEqual(
      {
        "cleanup.policy": ["compact"],
      },
    );
  });

  it("reports a cleanup policy list that mixes an allowed and a rejected entry", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @kafkaChannel(#{ topicConfiguration: #{ \`cleanup.policy\`: #["compact", "archive"] } })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("cleanup.policy");
  });

  it("reports a cleanup policy written as one value outside the allowed set", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @kafkaChannel(#{ topicConfiguration: #{ \`cleanup.policy\`: "archive" } })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("cleanup.policy");
  });

  it("emits the version alone when every field is left out", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @kafkaChannel(#{})
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    expect(channelsOf(doc)["orders.created"].bindings).toEqual({
      kafka: { bindingVersion: "0.5.0" },
    });
  });

  it("records one augment decorator once, however often the namespace reopens", async () => {
    // An augment decorator runs again for every declaration of its target, so
    // two blocks of one namespace run one `@@kafkaChannel` twice. That is one
    // application, not a repeated one, and must not report a collision.
    const doc = await emitDocument(`
      ${SERVICE}

      @channel("orders.created")
      namespace OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
      namespace OrderChannel {}

      @@kafkaChannel(Test.OrderChannel, #{ topic: "orders.created" });
    `);

    expect(bindingsOf(channelsOf(doc)["orders.created"].bindings).kafka.topic).toBe(
      "orders.created",
    );
  });

  it("keeps a server binding and a channel binding apart on one namespace", async () => {
    // One namespace can be both the service namespace and a channel. Both
    // Kafka bindings then sit on the same target but land on different
    // objects, so neither is a repeated protocol.
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
      @kafkaServer(#{ schemaRegistryUrl: "https://registry.example.com" })
      @kafkaChannel(#{ topic: "orders.created" })
      @channel("orders.created")
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @send
      op publish(event: OrderCreated): void;
    `);

    expect(bindingsOf(serversOf(doc).prod.bindings).kafka).toEqual({
      schemaRegistryUrl: "https://registry.example.com",
      bindingVersion: "0.5.0",
    });
    expect(bindingsOf(channelsOf(doc)["orders.created"].bindings).kafka).toEqual({
      topic: "orders.created",
      bindingVersion: "0.5.0",
    });
  });
});
