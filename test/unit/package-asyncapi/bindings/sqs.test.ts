import { describe, expect, it } from "vitest";
import {
  buildAsyncAPIWithDiagnostics,
  emitDocument,
  emitDocumentWithDiagnostics,
} from "../../../utils/test-host.js";
import { diagnosticsWith, findDiagnostic } from "../../../utils/diagnostics.js";
import { channelsOf, operationsOf, present } from "../../../utils/document.js";
import type { SqsChannelBindingObject } from "#emitter/types/index.js";
import { PUBLISH_ORDER_CREATED } from "../../../utils/source.js";
import { bindingFor, bindingsOf } from "../../../utils/document.js";

const SERVICE = `
  @service(#{ title: "Orders" })
  @server("prod", #{ host: "sqs.eu-west-1.amazonaws.com", protocol: "sqs" })
  namespace Test;

  @message
  model OrderCreated {
    orderId: string;
  }
`;

describe("Unit: the Amazon SQS binding decorators", () => {
  describe("@sqsChannel", () => {
    it("emits every queue field with the binding version", async () => {
      const doc = await emitDocument(`
        ${SERVICE}

        @sqsChannel(#{
          queue: #{
            name: "orders",
            fifoQueue: true,
            deduplicationScope: "messageGroup",
            fifoThroughputLimit: "perMessageGroupId",
            deliveryDelay: 5,
            visibilityTimeout: 30,
            receiveMessageWaitTime: 20,
            messageRetentionPeriod: 345600,
            tags: #{ team: "orders" },
          },
          deadLetterQueue: #{ name: "orders-dlq", fifoQueue: false },
        })
        @channel("orders")
        interface OrderChannel {
          ${PUBLISH_ORDER_CREATED}
        }
      `);

      expect(channelsOf(doc).orders.bindings).toEqual({
        sqs: {
          queue: {
            name: "orders",
            fifoQueue: true,
            deduplicationScope: "messageGroup",
            fifoThroughputLimit: "perMessageGroupId",
            deliveryDelay: 5,
            visibilityTimeout: 30,
            receiveMessageWaitTime: 20,
            messageRetentionPeriod: 345600,
            tags: { team: "orders" },
          },
          deadLetterQueue: { name: "orders-dlq", fifoQueue: false },
          bindingVersion: "0.2.0",
        },
      });
    });

    it("drops the whole binding when the queue is missing", async () => {
      const { doc, diagnostics } = await buildAsyncAPIWithDiagnostics(`
        ${SERVICE}

        @sqsChannel(#{})
        @channel("orders")
        interface OrderChannel {
          ${PUBLISH_ORDER_CREATED}
        }
      `);

      const reported = findDiagnostic(diagnostics, "missing-binding-field");
      expect(reported.message).toContain("queue");
      expect(reported.severity).toBe("error");
      expect(channelsOf(doc).orders.bindings).toBeUndefined();
    });

    it("requires both a name and a FIFO flag on a channel queue", async () => {
      const { doc, diagnostics } = await buildAsyncAPIWithDiagnostics(`
        ${SERVICE}

        @sqsChannel(#{ queue: #{ visibilityTimeout: 30 } })
        @channel("orders")
        interface OrderChannel {
          ${PUBLISH_ORDER_CREATED}
        }
      `);

      const missing = diagnosticsWith(diagnostics, "missing-binding-field");
      expect(missing).toHaveLength(2);
      const joined = missing.map((d) => d.message).join(" ");
      expect(joined).toContain("queue.name");
      expect(joined).toContain("queue.fifoQueue");
      expect(channelsOf(doc).orders.bindings).toBeUndefined();
    });

    it("keeps a fifoQueue of false", async () => {
      const doc = await emitDocument(`
        ${SERVICE}

        @sqsChannel(#{ queue: #{ name: "orders", fifoQueue: false } })
        @channel("orders")
        interface OrderChannel {
          ${PUBLISH_ORDER_CREATED}
        }
      `);

      // `false` says the queue is a standard queue. AsyncAPI requires the
      // field, so treating it as absent would drop the whole binding.
      expect(bindingsOf(channelsOf(doc).orders.bindings).sqs.queue).toEqual({
        name: "orders",
        fifoQueue: false,
      });
    });

    it("drops the whole binding when the dead letter queue is incomplete", async () => {
      const { doc, diagnostics } = await buildAsyncAPIWithDiagnostics(`
        ${SERVICE}

        @sqsChannel(#{
          queue: #{ name: "orders", fifoQueue: false },
          deadLetterQueue: #{ fifoQueue: false },
        })
        @channel("orders")
        interface OrderChannel {
          ${PUBLISH_ORDER_CREATED}
        }
      `);

      // The field is optional, but the author wrote it. A required field of
      // it is absent, which is an error, so the whole binding goes. Emitting
      // the rest would hand the author a document beside an error that says
      // the binding was dropped.
      const reported = findDiagnostic(diagnostics, "missing-binding-field");
      expect(reported.message).toContain("deadLetterQueue.name");
      expect(reported.severity).toBe("error");
      expect(channelsOf(doc).orders.bindings).toBeUndefined();
    });

    it("reports a deduplication scope SQS does not define, and keeps the queue", async () => {
      const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
        ${SERVICE}

        @sqsChannel(#{
          queue: #{ name: "orders", fifoQueue: true, deduplicationScope: "topic" },
        })
        @channel("orders")
        interface OrderChannel {
          ${PUBLISH_ORDER_CREATED}
        }
      `);

      const reported = findDiagnostic(diagnostics, "invalid-binding-field");
      expect(reported.message).toContain("queue.deduplicationScope");
      expect(reported.message).toContain("queue or messageGroup");
      // The two required fields are still there, so the binding survives.
      expect(bindingsOf(channelsOf(doc).orders.bindings).sqs.queue).toEqual({
        name: "orders",
        fifoQueue: true,
      });
    });

    it("reports a negative visibility timeout", async () => {
      const { diagnostics } = await emitDocumentWithDiagnostics(`
        ${SERVICE}

        @sqsChannel(#{
          queue: #{ name: "orders", fifoQueue: false, visibilityTimeout: -1 },
        })
        @channel("orders")
        interface OrderChannel {
          ${PUBLISH_ORDER_CREATED}
        }
      `);

      const reported = findDiagnostic(diagnostics, "invalid-binding-field");
      expect(reported.message).toContain("queue.visibilityTimeout");
      expect(reported.message).toContain("zero or more seconds");
    });

    it("reports a queue with a member the serializer cannot represent", async () => {
      const { doc, diagnostics } = await buildAsyncAPIWithDiagnostics(`
        ${SERVICE}

        scalar ipv4 extends string {
          init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
        }

        @sqsChannel(#{
          queue: #{
            name: "orders",
            fifoQueue: false,
            tags: #{ host: Test.ipv4.fromBytes(1, 2, 3, 4) },
          },
        })
        @channel("orders")
        interface OrderChannel {
          ${PUBLISH_ORDER_CREATED}
        }
      `);

      // One member the serializer cannot represent fails the whole queue, not
      // the one field that holds it. So the report names the queue, and the
      // binding cannot be written without it. The code says the binding went
      // with the field, and it is an error, because nothing was emitted.
      const reported = findDiagnostic(diagnostics, "invalid-required-binding-field");
      expect(reported.severity).toBe("error");
      expect(reported.message).toContain("'queue'");
      expect(reported.message).toContain("an object");
      expect(reported.message).toContain("the whole binding was dropped");
      expect(channelsOf(doc).orders.bindings).toBeUndefined();
    });

    it("reports a dead letter queue with a member the serializer cannot represent", async () => {
      const { doc, diagnostics } = await buildAsyncAPIWithDiagnostics(`
        ${SERVICE}

        scalar ipv4 extends string {
          init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
        }

        @sqsChannel(#{
          queue: #{ name: "orders", fifoQueue: false },
          deadLetterQueue: #{
            name: "orders-dlq",
            fifoQueue: false,
            tags: #{ host: Test.ipv4.fromBytes(1, 2, 3, 4) },
          },
        })
        @channel("orders")
        interface OrderChannel {
          ${PUBLISH_ORDER_CREATED}
        }
      `);

      // The dead letter queue costs the binding whichever way it fails. A
      // queue short of a required field already takes the binding, so a queue
      // the serializer cannot read at all takes it too.
      const reported = findDiagnostic(diagnostics, "invalid-required-binding-field");
      expect(reported.severity).toBe("error");
      expect(reported.message).toContain("'deadLetterQueue'");
      expect(reported.message).toContain("the whole binding was dropped");
      // `deadLetterQueue` is optional. The message has to state a reason that
      // holds here as well, so it names what the emitter cannot do rather
      // than what AsyncAPI requires.
      expect(reported.message).toContain("cannot be written without the field");
      expect(reported.message).not.toContain("AsyncAPI requires the field");
      expect(channelsOf(doc).orders.bindings).toBeUndefined();
    });

    it("drops an empty pass-through object rather than emitting one", async () => {
      const doc = await emitDocument(`
        ${SERVICE}

        @sqsChannel(#{
          queue: #{ name: "orders", fifoQueue: false, tags: #{} },
        })
        @channel("orders")
        interface OrderChannel {
          ${PUBLISH_ORDER_CREATED}
        }
      `);

      // An empty tag map states nothing, and every other binding drops an
      // empty nested object. SQS answers the same source the same way.
      expect(bindingsOf(channelsOf(doc).orders.bindings).sqs.queue).toEqual({
        name: "orders",
        fifoQueue: false,
      });
    });

    it("keeps a delivery delay of zero", async () => {
      const doc = await emitDocument(`
        ${SERVICE}

        @sqsChannel(#{
          queue: #{ name: "orders", fifoQueue: false, deliveryDelay: 0 },
        })
        @channel("orders")
        interface OrderChannel {
          ${PUBLISH_ORDER_CREATED}
        }
      `);

      // Zero turns the delay off, which is a setting rather than an absent
      // field.
      // See the note in the AMQP suite: a binding is an untyped record in the
      // document type, so the test names the shape it expects.
      const sqs = bindingFor(channelsOf(doc).orders.bindings, "sqs") as
        SqsChannelBindingObject | undefined;
      expect(present(sqs, "sqs binding").queue.deliveryDelay).toBe(0);
    });
  });

  describe("@sqsOperation", () => {
    it("emits the queue list with the binding version", async () => {
      const doc = await emitDocument(`
        ${SERVICE}

        @channel("orders")
        interface OrderChannel {
          @sqsOperation(#{
            queues: #[
              #{ name: "orders", fifoQueue: false },
              #{ name: "orders-audit", fifoQueue: false }
            ],
          })
          @send
          op publish(event: OrderCreated): void;
        }
      `);

      expect(operationsOf(doc).publish.bindings).toEqual({
        sqs: {
          queues: [
            { name: "orders", fifoQueue: false },
            { name: "orders-audit", fifoQueue: false },
          ],
          bindingVersion: "0.2.0",
        },
      });
    });

    it("requires only a name of a queue, unlike the channel binding", async () => {
      const doc = await emitDocument(`
        ${SERVICE}

        @channel("orders")
        interface OrderChannel {
          @sqsOperation(#{ queues: #[#{ name: "orders" }] })
          @send
          op publish(event: OrderCreated): void;
        }
      `);

      // AsyncAPI states a different required set at each level, and this
      // emitter follows each one where it applies.
      expect(bindingsOf(operationsOf(doc).publish.bindings).sqs.queues).toEqual([
        { name: "orders" },
      ]);
    });

    it("drops the whole binding when the queue list is missing", async () => {
      const { doc, diagnostics } = await buildAsyncAPIWithDiagnostics(`
        ${SERVICE}

        @channel("orders")
        interface OrderChannel {
          @sqsOperation(#{})
          @send
          op publish(event: OrderCreated): void;
        }
      `);

      const reported = findDiagnostic(diagnostics, "missing-binding-field");
      expect(reported.message).toContain("queues");
      expect(operationsOf(doc).publish.bindings).toBeUndefined();
    });

    it("drops the whole binding when the queue list is empty", async () => {
      const { doc, diagnostics } = await buildAsyncAPIWithDiagnostics(`
        ${SERVICE}

        @channel("orders")
        interface OrderChannel {
          @sqsOperation(#{ queues: #[] })
          @send
          op publish(event: OrderCreated): void;
        }
      `);

      // An emitted `queues: []` would fail validation, so the author is told
      // the field is missing rather than left with an invalid document.
      const missing = diagnosticsWith(diagnostics, "missing-binding-field");
      expect(missing.map((d) => d.message).join(" ")).toContain("the field 'queues'");
      expect(operationsOf(doc).publish.bindings).toBeUndefined();
    });

    it("drops the whole binding when one queue entry is incomplete", async () => {
      const { doc, diagnostics } = await buildAsyncAPIWithDiagnostics(`
        ${SERVICE}

        @channel("orders")
        interface OrderChannel {
          @sqsOperation(#{
            queues: #[#{ fifoQueue: false }, #{ name: "orders" }],
          })
          @send
          op publish(event: OrderCreated): void;
        }
      `);

      // A queue the author declared and the emitter dropped is worse than no
      // binding. The author has to fix the source either way, because the
      // diagnostic is an error.
      const reported = findDiagnostic(diagnostics, "missing-binding-field");
      expect(reported.message).toContain("queues[0].name");
      expect(operationsOf(doc).publish.bindings).toBeUndefined();
    });

    it("reports no keep-rest warning for a binding it drops whole", async () => {
      const { doc, diagnostics } = await buildAsyncAPIWithDiagnostics(`
        ${SERVICE}

        @channel("orders")
        interface OrderChannel {
          @sqsOperation(#{
            queues: #[
              #{ fifoQueue: false },
              #{ name: "orders-dlq", deduplicationScope: "bogus" },
            ],
          })
          @send
          op publish(event: OrderCreated): void;
        }
      `);

      // The first entry costs the whole binding. Reading the entries after it
      // would report fields of a binding nothing emits, and the author would
      // read "the rest of the binding was kept" beside "the whole binding was
      // dropped".
      const reported = findDiagnostic(diagnostics, "missing-binding-field");
      expect(reported.message).toContain("queues[0].name");
      expect(diagnosticsWith(diagnostics, "invalid-binding-field")).toEqual([]);
      expect(operationsOf(doc).publish.bindings).toBeUndefined();
    });

    it("reports a queue list the serializer cannot read as a list", async () => {
      const { doc, diagnostics } = await buildAsyncAPIWithDiagnostics(`
        ${SERVICE}

        scalar ipv4 extends string {
          init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
        }

        @channel("orders")
        interface OrderChannel {
          @sqsOperation(#{
            queues: #[#{ name: "orders", tags: #{ host: Test.ipv4.fromBytes(1, 2, 3, 4) } }],
          })
          @send
          op publish(event: OrderCreated): void;
        }
      `);

      // One entry the serializer cannot represent takes the whole list with
      // it, so the report names `queues` rather than the entry. The binding
      // needs the list, so the code is the error one.
      const reported = findDiagnostic(diagnostics, "invalid-required-binding-field");
      expect(reported.severity).toBe("error");
      expect(reported.message).toContain("'queues'");
      expect(reported.message).toContain("a list of queues");
      expect(reported.message).toContain("the whole binding was dropped");
      expect(operationsOf(doc).publish.bindings).toBeUndefined();
    });
  });
});
