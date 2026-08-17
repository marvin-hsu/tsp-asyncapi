/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, expect, it } from "vitest";
import { emitAsyncAPI, emitAsyncAPIWithDiagnostics } from "../../utils/test-host.js";
import { findDiagnostic } from "../../utils/diagnostics.js";

const MESSAGE = `
  @message
  model OrderCreated {
    id: string;
  }
`;

const OPERATION = `
  @send
  op publish(event: OrderCreated): void;
`;

function service(protocol: string): string {
  return `
    @service(#{ title: "Orders" })
    @server("prod", #{ host: "broker.example.com", protocol: "${protocol}" })
    namespace Test;

    ${MESSAGE}
  `;
}

describe("Unit: the Anypoint MQ binding decorators", () => {
  it("emits both levels with the binding version", async () => {
    const doc = await emitAsyncAPI(`
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
        ${OPERATION}
      }
    `);

    expect(doc.channels.orders.bindings.anypointmq).toEqual({
      destination: "orders",
      destinationType: "fifo-queue",
      bindingVersion: "0.0.1",
    });
    expect(doc.components.messages.OrderCreated.bindings.anypointmq).toEqual({
      headers: { type: "object" },
      bindingVersion: "0.0.1",
    });
  });

  it("reports a destination type Anypoint MQ does not define", async () => {
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${service("anypointmq")}

      @anypointMqChannel(#{ destination: "orders", destinationType: "topic" })
      @channel("orders")
      interface OrderChannel {
        ${OPERATION}
      }
    `);

    // Anypoint MQ lists no topic. JMS lists neither topic nor exchange, and
    // the two sets are checked apart for that reason.
    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
    expect(reported.message).toContain("destinationType");
    expect(reported.message).toContain("exchange or queue or fifo-queue");
  });
});
