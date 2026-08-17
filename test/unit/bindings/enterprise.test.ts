/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, expect, it } from "vitest";
import { emitAsyncAPI, emitAsyncAPIWithDiagnostics } from "../../utils/test-host.js";
import { findDiagnostic } from "../../utils/diagnostics.js";
import { AsyncAPITester } from "../../../src/testing/index.js";
import { buildAsyncAPIDocument } from "../../../src/pipeline.js";

/**
 * Anypoint MQ, JMS, IBM MQ and Solace.
 *
 * The four share a shape: a destination named by a string, a type drawn from
 * a fixed set, and a handful of numbers with a stated range. They are grouped
 * in one file because each one carries few rules of its own, and the rules
 * they do carry are worth reading side by side.
 */

/**
 * Builds a document from source, ignoring the error severity.
 *
 * A missing required field is an error, and the emitter writes no file once
 * one is reported.
 */
async function buildWithDiagnostics(code: string) {
  const runner = await AsyncAPITester.createInstance();
  const [, diagnostics] = await runner.compileAndDiagnose(code);
  return { doc: buildAsyncAPIDocument(runner.program, undefined, {}), diagnostics };
}

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

    expect(doc.channels.OrderChannel.bindings.anypointmq).toEqual({
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

describe("Unit: the JMS binding decorators", () => {
  it("emits all three levels with the binding version", async () => {
    const doc = await emitAsyncAPI(`
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

    expect(doc.servers.prod.bindings.jms).toEqual({
      jmsConnectionFactory: "org.apache.activemq.ActiveMQConnectionFactory",
      properties: [{ name: "disableTimeStampsByDefault", value: false }],
      clientID: "order-service",
      bindingVersion: "0.0.1",
    });
    expect(doc.channels.OrderChannel.bindings.jms.destinationType).toBe("queue");
    expect(doc.components.messages.OrderCreated.bindings.jms.headers).toEqual({
      type: "object",
    });
  });

  it("drops the whole server binding when the connection factory is missing", async () => {
    const { doc, diagnostics } = await buildWithDiagnostics(`
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

    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/missing-binding-field");
    expect(reported.message).toContain("jmsConnectionFactory");
    expect(reported.severity).toBe("error");
    expect(doc.servers?.prod.bindings).toBeUndefined();
  });

  it("rejects a destination type JMS does not define but Anypoint MQ does", async () => {
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${service("jms")}

      @jmsChannel(#{ destination: "orders", destinationType: "exchange" })
      @channel("orders")
      interface OrderChannel {
        ${OPERATION}
      }
    `);

    // `exchange` is legal on an Anypoint MQ channel and not on a JMS one.
    // One shared set would have let this through.
    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
    expect(reported.message).toContain("queue or fifo-queue");
  });

  it("drops an empty property list rather than emitting one", async () => {
    const doc = await emitAsyncAPI(`
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

    expect(doc.servers.prod.bindings.jms).toEqual({
      jmsConnectionFactory: "com.example.Factory",
      bindingVersion: "0.0.1",
    });
  });
});

describe("Unit: the IBM MQ binding decorators", () => {
  it("emits all three levels with the binding version", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @ibmMqServer(#{
        groupId: "PRODCLSTR1",
        ccdtQueueManagerName: "*",
        cipherSpec: "ANY_TLS12_OR_HIGHER",
        multiEndpointServer: false,
        heartBeatInterval: 300,
      })
      @server("prod", #{ host: "mq.example.com:1414", protocol: "ibmmq" })
      namespace Test;

      @ibmMqMessage(#{ type: "jms", headers: "Content-Type,Trace-Id", expiry: 60000 })
      @message
      model OrderCreated {
        id: string;
      }

      @ibmMqChannel(#{
        destinationType: "queue",
        queue: #{ objectName: "ORDERS.QUEUE", exclusive: true },
        maxMsgLength: 4194304,
      })
      @channel("orders")
      interface OrderChannel {
        ${OPERATION}
      }
    `);

    expect(doc.servers.prod.bindings.ibmmq).toEqual({
      groupId: "PRODCLSTR1",
      ccdtQueueManagerName: "*",
      cipherSpec: "ANY_TLS12_OR_HIGHER",
      multiEndpointServer: false,
      heartBeatInterval: 300,
      bindingVersion: "0.1.0",
    });
    expect(doc.channels.OrderChannel.bindings.ibmmq.queue).toEqual({
      objectName: "ORDERS.QUEUE",
      exclusive: true,
    });
    // `headers` is a comma-separated list here, not a Schema Object. IBM MQ
    // is the one binding in this library that states the field that way.
    expect(doc.components.messages.OrderCreated.bindings.ibmmq.headers).toBe(
      "Content-Type,Trace-Id",
    );
  });

  it("reports a heartbeat interval above the range IBM MQ states", async () => {
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
      @service(#{ title: "Orders" })
      @ibmMqServer(#{ groupId: "PRODCLSTR1", heartBeatInterval: 1000000 })
      @server("prod", #{ host: "mq.example.com:1414", protocol: "ibmmq" })
      namespace Test;

      ${MESSAGE}

      @channel("orders")
      interface OrderChannel {
        ${OPERATION}
      }
    `);

    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
    expect(reported.message).toContain("heartBeatInterval");
    expect(reported.message).toContain("a value from 0 to 999999");
    expect(doc.servers.prod.bindings.ibmmq).toEqual({
      groupId: "PRODCLSTR1",
      bindingVersion: "0.1.0",
    });
  });

  it("accepts both ends of the message length range", async () => {
    for (const length of [0, 104857600]) {
      const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
        ${service("ibmmq")}

        @ibmMqChannel(#{ maxMsgLength: ${String(length)} })
        @channel("orders")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      // The range is inclusive at both ends.
      expect(diagnostics.filter((d) => d.code === "tsp-asyncapi/invalid-binding-field")).toEqual(
        [],
      );
      expect(doc.channels.OrderChannel.bindings.ibmmq.maxMsgLength).toBe(length);
    }
  });

  it("reports a message length above 100 MB", async () => {
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${service("ibmmq")}

      @ibmMqChannel(#{ maxMsgLength: 104857601 })
      @channel("orders")
      interface OrderChannel {
        ${OPERATION}
      }
    `);

    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
    expect(reported.message).toContain("maxMsgLength");
  });

  it("reports a negative expiry", async () => {
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
      @service(#{ title: "Orders" })
      @server("prod", #{ host: "mq.example.com:1414", protocol: "ibmmq" })
      namespace Test;

      @ibmMqMessage(#{ expiry: -1 })
      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders")
      interface OrderChannel {
        ${OPERATION}
      }
    `);

    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
    expect(reported.message).toContain("expiry");
    expect(reported.message).toContain("zero or more");
  });

  it("drops an empty queue object rather than emitting one", async () => {
    const doc = await emitAsyncAPI(`
      ${service("ibmmq")}

      @ibmMqChannel(#{ destinationType: "queue", queue: #{} })
      @channel("orders")
      interface OrderChannel {
        ${OPERATION}
      }
    `);

    expect(doc.channels.OrderChannel.bindings.ibmmq).toEqual({
      destinationType: "queue",
      bindingVersion: "0.1.0",
    });
  });
});

describe("Unit: the Solace binding decorators", () => {
  it("emits both levels with the binding version", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @solaceServer(#{ msgVpn: "orders-vpn", clientName: "order-service" })
      @server("prod", #{ host: "solace.example.com:55555", protocol: "smf" })
      namespace Test;

      ${MESSAGE}

      @channel("orders")
      interface OrderChannel {
        @solaceOperation(#{
          destinations: #[
            #{
              destinationType: "queue",
              deliveryMode: "persistent",
              queue: #{ name: "orders", accessType: "exclusive" },
            }
          ],
          timeToLive: 60000,
          priority: 1,
          dmqEligible: true,
        })
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    // The field is `msgVpn`. Version 0.2.0 of the binding spells it
    // `msvVpn`, and this library emits 0.4.0.
    expect(doc.servers.prod.bindings.solace).toEqual({
      msgVpn: "orders-vpn",
      clientName: "order-service",
      bindingVersion: "0.4.0",
    });
    expect(doc.operations.publish.bindings.solace).toEqual({
      destinations: [
        {
          deliveryMode: "persistent",
          destinationType: "queue",
          queue: { name: "orders", accessType: "exclusive" },
        },
      ],
      timeToLive: 60000,
      priority: 1,
      dmqEligible: true,
      bindingVersion: "0.4.0",
    });
  });

  it("reports a delivery mode Solace does not define, and keeps the entry", async () => {
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${service("smf")}

      @channel("orders")
      interface OrderChannel {
        @solaceOperation(#{
          destinations: #[#{ destinationType: "topic", deliveryMode: "guaranteed" }],
        })
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
    expect(reported.message).toContain("destinations[0].deliveryMode");
    expect(reported.message).toContain("direct or persistent");
    // The entry still names the destination the author wrote.
    expect(doc.operations.publish.bindings.solace.destinations).toEqual([
      { destinationType: "topic" },
    ]);
  });

  it("reports a client name longer than Solace allows", async () => {
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
      @service(#{ title: "Orders" })
      @solaceServer(#{ clientName: "${"c".repeat(161)}" })
      @server("prod", #{ host: "solace.example.com:55555", protocol: "smf" })
      namespace Test;

      ${MESSAGE}

      @channel("orders")
      interface OrderChannel {
        ${OPERATION}
      }
    `);

    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
    expect(reported.message).toContain("clientName");
    expect(reported.message).toContain("at most 160 characters");
  });

  it("reports a negative priority", async () => {
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${service("smf")}

      @channel("orders")
      interface OrderChannel {
        @solaceOperation(#{ priority: -1 })
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
    expect(reported.message).toContain("priority");
    expect(reported.message).toContain("zero or more");
  });

  it("drops a destination list left with no entry", async () => {
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${service("smf")}

      @channel("orders")
      interface OrderChannel {
        @solaceOperation(#{ destinations: #["not-an-object"], timeToLive: 60000 })
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
    expect(doc.operations.publish.bindings.solace).toEqual({
      timeToLive: 60000,
      bindingVersion: "0.4.0",
    });
  });
});
