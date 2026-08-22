import { describe, expect, it } from "vitest";
import { emitDocument, emitDocumentWithDiagnostics } from "../../../utils/test-host.js";
import { findDiagnostic, targetText } from "../../../utils/diagnostics.js";
import { operationsOf } from "../../../utils/document.js";

const SERVICE = `
  @service(#{ title: "Orders" })
  @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
  namespace Test;

  @message
  model OrderCreated {
    id: string;
  }
`;

describe("Unit: the @kafkaOperation decorator", () => {
  it("emits both schema fields with the binding version", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @channel("orders.created")
      interface OrderChannel {
        @kafkaOperation(#{
          groupId: #{ type: "string", description: "The consumer group." },
          clientId: #{ type: "string" },
        })
        @receive
        op onOrderCreated(): OrderCreated;
      }
    `);

    expect(operationsOf(doc).onOrderCreated.bindings).toEqual({
      kafka: {
        groupId: { type: "string", description: "The consumer group." },
        clientId: { type: "string" },
        bindingVersion: "0.5.0",
      },
    });
  });

  it("emits the version alone when every field is left out", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @channel("orders.created")
      interface OrderChannel {
        @kafkaOperation(#{})
        @receive
        op onOrderCreated(): OrderCreated;
      }
    `);

    expect(operationsOf(doc).onOrderCreated.bindings).toEqual({
      kafka: { bindingVersion: "0.5.0" },
    });
  });

  it("reports a group id that is not a schema object", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @channel("orders.created")
      interface OrderChannel {
        @kafkaOperation(#{ groupId: "order-workers", clientId: #{ type: "string" } })
        @receive
        op onOrderCreated(): OrderCreated;
      }
    `);

    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("groupId");
    expect(reported.message).toContain("a schema object");
    // The squiggle sits on the config literal, not on the whole operation.
    // The channel and message levels both pin this and the operation level
    // did not: dropping the argument target left the suite green.
    expect(targetText(reported)).toBe(
      '#{ groupId: "order-workers", clientId: #{ type: "string" } }',
    );
    // The rejected field is dropped, and the rest of the binding is emitted.
    expect(operationsOf(doc).onOrderCreated.bindings?.kafka).toEqual({
      clientId: { type: "string" },
      bindingVersion: "0.5.0",
    });
  });

  it("reports a client id that is an array", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @channel("orders.created")
      interface OrderChannel {
        @kafkaOperation(#{ clientId: #["a"] })
        @receive
        op onOrderCreated(): OrderCreated;
      }
    `);

    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("clientId");
  });

  it("reports an operation that carries no action", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @channel("orders.created")
      interface OrderChannel {
        @kafkaOperation(#{ groupId: #{ type: "string" } })
        op notAnOperation(event: OrderCreated): void;

        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, "binding-outside-document");
    expect(reported.message).toContain("kafka");
    expect(reported.message).toContain("for the operation level");
  });

  it("reports a generic @binding that claims the kafka member at this level", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @channel("orders.created")
      interface OrderChannel {
        @kafkaOperation(#{ groupId: #{ type: "string" } })
        @binding("kafka", #{ clientId: #{ type: "string" } })
        @receive
        op onOrderCreated(): OrderCreated;
      }
    `);

    const reported = findDiagnostic(diagnostics, "duplicate-binding");
    expect(reported.message).toContain("kafka");
    expect(reported.message).toContain("at the operation level");
  });
});
