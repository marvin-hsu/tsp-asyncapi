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
