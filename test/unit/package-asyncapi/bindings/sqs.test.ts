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

    it("drops an incomplete dead letter queue and keeps the rest", async () => {
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

      // The dead letter queue is optional, so only it goes. The channel still
      // names the queue it is.
      const reported = findDiagnostic(diagnostics, "missing-binding-field");
      expect(reported.message).toContain("deadLetterQueue.name");
      expect(channelsOf(doc).orders.bindings).toEqual({
        sqs: { queue: { name: "orders", fifoQueue: false }, bindingVersion: "0.2.0" },
      });
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

    it("drops the whole binding when every entry was rejected", async () => {
      const { doc, diagnostics } = await buildAsyncAPIWithDiagnostics(`
        ${SERVICE}

        @channel("orders")
        interface OrderChannel {
          @sqsOperation(#{ queues: #[#{ fifoQueue: false }] })
          @send
          op publish(event: OrderCreated): void;
        }
      `);

      // An emitted `queues: []` would fail validation, so the author is told
      // the field is missing rather than left with an invalid document.
      const missing = diagnosticsWith(diagnostics, "missing-binding-field");
      expect(missing.map((d) => d.message).join(" ")).toContain("queues[0].name");
      expect(missing.map((d) => d.message).join(" ")).toContain("the field 'queues'");
      expect(operationsOf(doc).publish.bindings).toBeUndefined();
    });

    it("keeps the entries that survived when one was rejected", async () => {
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

      // One bad entry is no reason to lose an entry the author wrote
      // correctly, and the emitted list is still valid.
      findDiagnostic(diagnostics, "missing-binding-field");
      expect(operationsOf(doc).publish.bindings).toEqual({
        sqs: { queues: [{ name: "orders" }], bindingVersion: "0.2.0" },
      });
    });
  });
});
