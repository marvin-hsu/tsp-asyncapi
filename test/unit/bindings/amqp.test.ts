import { describe, expect, it } from "vitest";
import { emitDocument, emitDocumentWithDiagnostics } from "../../utils/test-host.js";
import { diagnosticsWith, findDiagnostic } from "../../utils/diagnostics.js";
import { channelsOf, messagesOf, operationsOf, present } from "../../utils/document.js";
import type { AmqpChannelBindingObject } from "#emitter/types/index.js";

const SERVICE = `
  @service(#{ title: "Events" })
  @server("prod", #{ host: "rabbit.example.com:5672", protocol: "amqp" })
  namespace Test;

  @message
  model EventCreated {
    id: string;
  }
`;

const OPERATION = `
  @send
  op publish(event: EventCreated): void;
`;

describe("Unit: the AMQP binding decorators", () => {
  describe("@amqpChannel", () => {
    it("emits every field with the binding version", async () => {
      const doc = await emitDocument(`
        ${SERVICE}

        @amqpChannel(#{
          \`is\`: "routingKey",
          exchange: #{ name: "events", type: "topic", durable: true, autoDelete: false, vhost: "/" },
          queue: #{ name: "events-q", durable: true, exclusive: false, autoDelete: false, vhost: "/" },
        })
        @channel("events.created")
        interface EventChannel {
          ${OPERATION}
        }
      `);

      expect(channelsOf(doc)["events.created"].bindings).toEqual({
        amqp: {
          is: "routingKey",
          exchange: {
            name: "events",
            type: "topic",
            durable: true,
            autoDelete: false,
            vhost: "/",
          },
          queue: {
            name: "events-q",
            durable: true,
            exclusive: false,
            autoDelete: false,
            vhost: "/",
          },
          bindingVersion: "0.3.0",
        },
      });
    });

    it("reports an exchange type AMQP does not define, and keeps the rest", async () => {
      const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
        ${SERVICE}

        @amqpChannel(#{ exchange: #{ name: "events", type: "broadcast" } })
        @channel("events.created")
        interface EventChannel {
          ${OPERATION}
        }
      `);

      const reported = findDiagnostic(diagnostics, "invalid-binding-field");
      expect(reported.message).toContain("exchange.type");
      expect(reported.message).toContain("topic or direct or fanout or default or headers");
      // The name is still what the author wrote, so losing it as well would
      // take away something correct.
      expect(channelsOf(doc)["events.created"].bindings?.amqp.exchange).toEqual({ name: "events" });
    });

    it("reports a name longer than AMQP allows", async () => {
      const { diagnostics } = await emitDocumentWithDiagnostics(`
        ${SERVICE}

        @amqpChannel(#{ queue: #{ name: "${"q".repeat(256)}" } })
        @channel("events.created")
        interface EventChannel {
          ${OPERATION}
        }
      `);

      // A broker refuses a longer name at connect time, so emitting it would
      // describe a topology that cannot be built.
      const reported = findDiagnostic(diagnostics, "invalid-binding-field");
      expect(reported.message).toContain("queue.name");
      expect(reported.message).toContain("at most 255 characters");
    });

    it("accepts a name of exactly the length AMQP allows", async () => {
      const name = "q".repeat(255);
      const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
        ${SERVICE}

        @amqpChannel(#{ queue: #{ name: "${name}" } })
        @channel("events.created")
        interface EventChannel {
          ${OPERATION}
        }
      `);

      // The limit is inclusive. An off-by-one check would reject a name the
      // broker accepts.
      expect(diagnosticsWith(diagnostics, "invalid-binding-field")).toEqual([]);
      // `bindings` is a record of untyped records in the document type, on
      // purpose: a binding is whatever its protocol says. The test names the
      // shape it expects, which is the same shape the emitter writes.
      const amqp = channelsOf(doc)["events.created"].bindings?.amqp as
        AmqpChannelBindingObject | undefined;
      expect(present(amqp?.queue, "amqp queue").name).toBe(name);
    });

    it("drops an exchange that has nothing left in it", async () => {
      const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
        ${SERVICE}

        @amqpChannel(#{ \`is\`: "queue", exchange: #{ type: "broadcast" } })
        @channel("events.created")
        interface EventChannel {
          ${OPERATION}
        }
      `);

      // The only field the exchange carried was rejected. An empty object
      // states no exchange at all.
      findDiagnostic(diagnostics, "invalid-binding-field");
      expect(channelsOf(doc)["events.created"].bindings?.amqp).toEqual({
        is: "queue",
        bindingVersion: "0.3.0",
      });
    });

    it("reports an `is` outside the two AMQP defines", async () => {
      const { diagnostics } = await emitDocumentWithDiagnostics(`
        ${SERVICE}

        @amqpChannel(#{ \`is\`: "topic" })
        @channel("events.created")
        interface EventChannel {
          ${OPERATION}
        }
      `);

      const reported = findDiagnostic(diagnostics, "invalid-binding-field");
      expect(reported.message).toContain("queue or routingKey");
    });
  });

  describe("@amqpOperation", () => {
    it("emits every field in the order the specification lists them", async () => {
      const doc = await emitDocument(`
        ${SERVICE}

        @channel("events.created")
        interface EventChannel {
          @amqpOperation(#{
            ack: true,
            timestamp: true,
            bcc: #["events.audit"],
            mandatory: true,
            deliveryMode: 2,
            priority: 5,
            cc: #["events.log"],
            userId: "publisher",
            expiration: 60000,
          })
          @send
          op publish(event: EventCreated): void;
        }
      `);

      // The author wrote the fields in reverse. The emitted order follows the
      // specification, so two documents describing one operation cannot
      // differ by how their author typed a literal.
      const emitted = operationsOf(doc).publish.bindings?.amqp as Record<string, unknown>;
      expect(Object.keys(emitted)).toEqual([
        "expiration",
        "userId",
        "cc",
        "priority",
        "deliveryMode",
        "mandatory",
        "bcc",
        "timestamp",
        "ack",
        "bindingVersion",
      ]);
    });

    it("reports a delivery mode outside the two AMQP defines", async () => {
      const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
        ${SERVICE}

        @channel("events.created")
        interface EventChannel {
          @amqpOperation(#{ deliveryMode: 3, userId: "publisher" })
          @send
          op publish(event: EventCreated): void;
        }
      `);

      const reported = findDiagnostic(diagnostics, "invalid-binding-field");
      expect(reported.message).toContain("deliveryMode");
      expect(reported.message).toContain("1, 2");
      expect(operationsOf(doc).publish.bindings?.amqp).toEqual({
        userId: "publisher",
        bindingVersion: "0.3.0",
      });
    });

    it("reports a negative expiration", async () => {
      const { diagnostics } = await emitDocumentWithDiagnostics(`
        ${SERVICE}

        @channel("events.created")
        interface EventChannel {
          @amqpOperation(#{ expiration: -1 })
          @send
          op publish(event: EventCreated): void;
        }
      `);

      // The field is a length of time in milliseconds, and time is never
      // negative.
      const reported = findDiagnostic(diagnostics, "invalid-binding-field");
      expect(reported.message).toContain("expiration");
      expect(reported.message).toContain("zero or more");
    });

    it("keeps an expiration of zero", async () => {
      const doc = await emitDocument(`
        ${SERVICE}

        @channel("events.created")
        interface EventChannel {
          @amqpOperation(#{ expiration: 0 })
          @send
          op publish(event: EventCreated): void;
        }
      `);

      expect(operationsOf(doc).publish.bindings?.amqp).toEqual({
        expiration: 0,
        bindingVersion: "0.3.0",
      });
    });

    it("drops the blank entries of a routing key list", async () => {
      const doc = await emitDocument(`
        ${SERVICE}

        @channel("events.created")
        interface EventChannel {
          @amqpOperation(#{ cc: #["events.log", "  ", " events.audit "] })
          @send
          op publish(event: EventCreated): void;
        }
      `);

      // A blank entry names no routing key, and a padded one names the key
      // the author meant.
      expect(operationsOf(doc).publish.bindings?.amqp.cc).toEqual(["events.log", "events.audit"]);
    });

    it("drops a routing key list left with nothing in it", async () => {
      const doc = await emitDocument(`
        ${SERVICE}

        @channel("events.created")
        interface EventChannel {
          @amqpOperation(#{ cc: #["  "], ack: true })
          @send
          op publish(event: EventCreated): void;
        }
      `);

      expect(operationsOf(doc).publish.bindings?.amqp).toEqual({
        ack: true,
        bindingVersion: "0.3.0",
      });
    });
  });

  describe("@amqpMessage", () => {
    it("emits both fields with the binding version", async () => {
      const doc = await emitDocument(`
        @service(#{ title: "Events" })
        @server("prod", #{ host: "rabbit.example.com:5672", protocol: "amqp" })
        namespace Test;

        @amqpMessage(#{ contentEncoding: "gzip", messageType: "event.created" })
        @message
        model EventCreated {
          id: string;
        }

        @channel("events.created")
        interface EventChannel {
          ${OPERATION}
        }
      `);

      expect(messagesOf(doc).EventCreated.bindings).toEqual({
        amqp: {
          contentEncoding: "gzip",
          messageType: "event.created",
          bindingVersion: "0.3.0",
        },
      });
    });

    it("drops a blank field rather than emitting one", async () => {
      const doc = await emitDocument(`
        @service(#{ title: "Events" })
        @server("prod", #{ host: "rabbit.example.com:5672", protocol: "amqp" })
        namespace Test;

        @amqpMessage(#{ contentEncoding: "   ", messageType: "event.created" })
        @message
        model EventCreated {
          id: string;
        }

        @channel("events.created")
        interface EventChannel {
          ${OPERATION}
        }
      `);

      expect(messagesOf(doc).EventCreated.bindings?.amqp).toEqual({
        messageType: "event.created",
        bindingVersion: "0.3.0",
      });
    });
  });
});
