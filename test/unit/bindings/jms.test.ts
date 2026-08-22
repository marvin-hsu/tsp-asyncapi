import { describe, expect, it } from "vitest";
import {
  buildAsyncAPIWithDiagnostics,
  emitDocument,
  emitDocumentWithDiagnostics,
} from "../../utils/test-host.js";
import { findDiagnostic } from "../../utils/diagnostics.js";
import { channelsOf, messagesOf, serversOf } from "../../utils/document.js";

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

describe("Unit: the JMS binding decorators", () => {
  it("emits all three levels with the binding version", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @jmsServer(#{
        jmsConnectionFactory: "org.apache.activemq.ActiveMQConnectionFactory",
        properties: #[#{ name: "disableTimeStampsByDefault", value: false }],
        clientID: "order-service",
      })
      @server("prod", #{ host: "jms.example.com:61616", protocol: "jms" })
      namespace Test;

      @jmsMessage(#{ headers: #{ type: "object" } })
      @message
      model OrderCreated {
        id: string;
      }

      @jmsChannel(#{ destination: "orders", destinationType: "queue" })
      @channel("orders")
      interface OrderChannel {
        ${OPERATION}
      }
    `);

    expect(serversOf(doc).prod.bindings?.jms).toEqual({
      jmsConnectionFactory: "org.apache.activemq.ActiveMQConnectionFactory",
      properties: [{ name: "disableTimeStampsByDefault", value: false }],
      clientID: "order-service",
      bindingVersion: "0.0.1",
    });
    expect(channelsOf(doc).orders.bindings?.jms.destinationType).toBe("queue");
    expect(messagesOf(doc).OrderCreated.bindings?.jms.headers).toEqual({
      type: "object",
    });
  });

  it("drops the whole server binding when the connection factory is missing", async () => {
    const { doc, diagnostics } = await buildAsyncAPIWithDiagnostics(`
      @service(#{ title: "Orders" })
      @jmsServer(#{ clientID: "order-service" })
      @server("prod", #{ host: "jms.example.com:61616", protocol: "jms" })
      namespace Test;

      ${MESSAGE}

      @channel("orders")
      interface OrderChannel {
        ${OPERATION}
      }
    `);

    const reported = findDiagnostic(diagnostics, "missing-binding-field");
    expect(reported.message).toContain("jmsConnectionFactory");
    expect(reported.severity).toBe("error");
    expect(doc.servers?.prod.bindings).toBeUndefined();
  });

  it("rejects a destination type JMS does not define but Anypoint MQ does", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${service("jms")}

      @jmsChannel(#{ destination: "orders", destinationType: "exchange" })
      @channel("orders")
      interface OrderChannel {
        ${OPERATION}
      }
    `);

    // `exchange` is legal on an Anypoint MQ channel and not on a JMS one.
    // One shared set would have let this through.
    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("queue or fifo-queue");
  });

  it("drops an empty property list rather than emitting one", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @jmsServer(#{ jmsConnectionFactory: "com.example.Factory", properties: #[] })
      @server("prod", #{ host: "jms.example.com:61616", protocol: "jms" })
      namespace Test;

      ${MESSAGE}

      @channel("orders")
      interface OrderChannel {
        ${OPERATION}
      }
    `);

    expect(serversOf(doc).prod.bindings?.jms).toEqual({
      jmsConnectionFactory: "com.example.Factory",
      bindingVersion: "0.0.1",
    });
  });
});
