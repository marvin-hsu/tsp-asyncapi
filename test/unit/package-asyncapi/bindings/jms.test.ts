import { describe, expect, it } from "vitest";
import {
  buildAsyncAPIWithDiagnostics,
  emitDocument,
  emitDocumentWithDiagnostics,
} from "../../../utils/test-host.js";
import { diagnosticsWith, findDiagnostic } from "../../../utils/diagnostics.js";
import { channelsOf, messagesOf, serversOf } from "../../../utils/document.js";
import { ORDER_CREATED, PUBLISH_ORDER_CREATED, brokerService } from "../../../utils/source.js";
import { bindingsOf } from "../../../utils/document.js";

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
        ${PUBLISH_ORDER_CREATED}
      }
    `);

    expect(bindingsOf(serversOf(doc).prod.bindings).jms).toEqual({
      jmsConnectionFactory: "org.apache.activemq.ActiveMQConnectionFactory",
      properties: [{ name: "disableTimeStampsByDefault", value: false }],
      clientID: "order-service",
      bindingVersion: "0.0.1",
    });
    expect(bindingsOf(channelsOf(doc).orders.bindings).jms.destinationType).toBe("queue");
    expect(bindingsOf(messagesOf(doc).OrderCreated.bindings).jms.headers).toEqual({
      type: "object",
    });
  });

  it("drops the whole server binding when the connection factory is missing", async () => {
    const { doc, diagnostics } = await buildAsyncAPIWithDiagnostics(`
      @service(#{ title: "Orders" })
      @jmsServer(#{ clientID: "order-service" })
      @server("prod", #{ host: "jms.example.com:61616", protocol: "jms" })
      namespace Test;

      ${ORDER_CREATED}

      @channel("orders")
      interface OrderChannel {
        ${PUBLISH_ORDER_CREATED}
      }
    `);

    const reported = findDiagnostic(diagnostics, "missing-binding-field");
    expect(reported.message).toContain("jmsConnectionFactory");
    expect(reported.severity).toBe("error");
    expect(doc.servers?.prod.bindings).toBeUndefined();
  });

  it("rejects a destination type JMS does not define but Anypoint MQ does", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${brokerService("jms")}

      @jmsChannel(#{ destination: "orders", destinationType: "exchange" })
      @channel("orders")
      interface OrderChannel {
        ${PUBLISH_ORDER_CREATED}
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

      ${ORDER_CREATED}

      @channel("orders")
      interface OrderChannel {
        ${PUBLISH_ORDER_CREATED}
      }
    `);

    expect(bindingsOf(serversOf(doc).prod.bindings).jms).toEqual({
      jmsConnectionFactory: "com.example.Factory",
      bindingVersion: "0.0.1",
    });
  });

  it("drops a properties entry that has no name or no value", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      @jmsServer(#{
        jmsConnectionFactory: "com.example.Factory",
        properties: #[
          #{ name: "keep", value: true },
          #{ name: "missing-value" },
          #{ value: 1 },
          "not-an-object",
        ],
      })
      @server("prod", #{ host: "jms.example.com:61616", protocol: "jms" })
      namespace Test;

      ${ORDER_CREATED}

      @channel("orders")
      interface OrderChannel {
        ${PUBLISH_ORDER_CREATED}
      }
    `);

    const reported = diagnosticsWith(diagnostics, "invalid-binding-field");
    expect(reported).toHaveLength(3);
    expect(reported.every((diagnostic) => diagnostic.message.includes("properties["))).toBe(true);
    expect(bindingsOf(serversOf(doc).prod.bindings).jms.properties).toEqual([
      { name: "keep", value: true },
    ]);
  });
});
