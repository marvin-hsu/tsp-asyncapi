import { describe, expect, it } from "vitest";
import { emitDocument, emitDocumentWithDiagnostics } from "../../utils/test-host.js";
import { channelsOf, messagesOf } from "../../utils/document.js";
import { findDiagnostic } from "../../utils/diagnostics.js";
import { PUBLISH_ORDER_CREATED, brokerService } from "../../utils/source.js";

describe("Unit: the Anypoint MQ binding decorators", () => {
  it("emits both levels with the binding version", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("prod", #{ host: "broker.example.com", protocol: "anypointmq" })
      namespace Test;

      @anypointMqMessage(#{ headers: #{ type: "object" } })
      @message
      model OrderCreated {
        id: string;
      }

      @anypointMqChannel(#{ destination: "orders", destinationType: "fifo-queue" })
      @channel("orders")
      interface OrderChannel {
        ${PUBLISH_ORDER_CREATED}
      }
    `);

    expect(channelsOf(doc).orders.bindings?.anypointmq).toEqual({
      destination: "orders",
      destinationType: "fifo-queue",
      bindingVersion: "0.0.1",
    });
    expect(messagesOf(doc).OrderCreated.bindings?.anypointmq).toEqual({
      headers: { type: "object" },
      bindingVersion: "0.0.1",
    });
  });

  it("reports a destination type Anypoint MQ does not define", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${brokerService("anypointmq")}

      @anypointMqChannel(#{ destination: "orders", destinationType: "topic" })
      @channel("orders")
      interface OrderChannel {
        ${PUBLISH_ORDER_CREATED}
      }
    `);

    // Anypoint MQ lists no topic. JMS lists neither topic nor exchange, and
    // the two sets are checked apart for that reason.
    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("destinationType");
    expect(reported.message).toContain("exchange or queue or fifo-queue");
  });
});
