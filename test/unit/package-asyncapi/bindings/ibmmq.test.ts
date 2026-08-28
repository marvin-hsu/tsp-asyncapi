import { describe, expect, it } from "vitest";
import { emitDocument, emitDocumentWithDiagnostics } from "../../../utils/test-host.js";
import { diagnosticsWith, findDiagnostic } from "../../../utils/diagnostics.js";
import { channelsOf, messagesOf, serversOf } from "../../../utils/document.js";
import { ORDER_CREATED, PUBLISH_ORDER_CREATED, brokerService } from "../../../utils/source.js";
import { bindingsOf } from "../../../utils/document.js";

describe("Unit: the IBM MQ binding decorators", () => {
  it("emits all three levels with the binding version", async () => {
    const doc = await emitDocument(`
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

      @ibmMqMessage(#{ type: "binary", headers: "Content-Type,Trace-Id", expiry: 60000 })
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
        ${PUBLISH_ORDER_CREATED}
      }
    `);

    expect(bindingsOf(serversOf(doc).prod.bindings).ibmmq).toEqual({
      groupId: "PRODCLSTR1",
      ccdtQueueManagerName: "*",
      cipherSpec: "ANY_TLS12_OR_HIGHER",
      multiEndpointServer: false,
      heartBeatInterval: 300,
      bindingVersion: "0.1.0",
    });
    expect(bindingsOf(channelsOf(doc).orders.bindings).ibmmq.queue).toEqual({
      objectName: "ORDERS.QUEUE",
      exclusive: true,
    });
    // `headers` is a comma-separated list here, not a Schema Object. IBM MQ
    // is the one binding in this library that states the field that way.
    expect(bindingsOf(messagesOf(doc).OrderCreated.bindings).ibmmq.headers).toBe(
      "Content-Type,Trace-Id",
    );
  });

  it("reports a heartbeat interval above the range IBM MQ states", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      @ibmMqServer(#{ groupId: "PRODCLSTR1", heartBeatInterval: 1000000 })
      @server("prod", #{ host: "mq.example.com:1414", protocol: "ibmmq" })
      namespace Test;

      ${ORDER_CREATED}

      @channel("orders")
      interface OrderChannel {
        ${PUBLISH_ORDER_CREATED}
      }
    `);

    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("heartBeatInterval");
    expect(reported.message).toContain("a value from 0 to 999999");
    expect(bindingsOf(serversOf(doc).prod.bindings).ibmmq).toEqual({
      groupId: "PRODCLSTR1",
      bindingVersion: "0.1.0",
    });
  });

  it("accepts both ends of the message length range", async () => {
    for (const length of [0, 104857600]) {
      const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
        ${brokerService("ibmmq")}

        @ibmMqChannel(#{ maxMsgLength: ${String(length)} })
        @channel("orders")
        interface OrderChannel {
          ${PUBLISH_ORDER_CREATED}
        }
      `);

      // The range is inclusive at both ends.
      expect(diagnosticsWith(diagnostics, "invalid-binding-field")).toEqual([]);
      expect(bindingsOf(channelsOf(doc).orders.bindings).ibmmq.maxMsgLength).toBe(length);
    }
  });

  it("reports a message length above 100 MB", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${brokerService("ibmmq")}

      @ibmMqChannel(#{ maxMsgLength: 104857601 })
      @channel("orders")
      interface OrderChannel {
        ${PUBLISH_ORDER_CREATED}
      }
    `);

    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("maxMsgLength");
  });

  it("reports a negative expiry", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
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
        ${PUBLISH_ORDER_CREATED}
      }
    `);

    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("expiry");
    expect(reported.message).toContain("zero or more");
  });

  it("drops headers on a payload IBM MQ does not allow them on", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      @server("prod", #{ host: "mq.example.com:1414", protocol: "ibmmq" })
      namespace Test;

      @ibmMqMessage(#{ type: "jms", headers: "Content-Type", expiry: 60000 })
      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders")
      interface OrderChannel {
        ${PUBLISH_ORDER_CREATED}
      }
    `);

    // IBM MQ allows `headers` on a binary payload and on no other, so the
    // field goes and the declared type stays.
    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("headers");
    expect(reported.message).toContain("a binary payload");
    expect(bindingsOf(messagesOf(doc).OrderCreated.bindings).ibmmq).toEqual({
      type: "jms",
      expiry: 60000,
      bindingVersion: "0.1.0",
    });
  });

  it("keeps headers on a binary payload", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("prod", #{ host: "mq.example.com:1414", protocol: "ibmmq" })
      namespace Test;

      @ibmMqMessage(#{ type: "binary", headers: "Content-Type,X-Trace" })
      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders")
      interface OrderChannel {
        ${PUBLISH_ORDER_CREATED}
      }
    `);

    expect(bindingsOf(messagesOf(doc).OrderCreated.bindings).ibmmq.headers).toBe(
      "Content-Type,X-Trace",
    );
  });

  it("keeps headers when the binding names no type", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("prod", #{ host: "mq.example.com:1414", protocol: "ibmmq" })
      namespace Test;

      @ibmMqMessage(#{ headers: "Content-Type" })
      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders")
      interface OrderChannel {
        ${PUBLISH_ORDER_CREATED}
      }
    `);

    // The specification leaves this valid: its `binary` branch matches when
    // the type is absent, so the parser accepts the pair.
    expect(bindingsOf(messagesOf(doc).OrderCreated.bindings).ibmmq).toEqual({
      headers: "Content-Type",
      bindingVersion: "0.1.0",
    });
  });

  it("drops an empty queue object rather than emitting one", async () => {
    const doc = await emitDocument(`
      ${brokerService("ibmmq")}

      @ibmMqChannel(#{ destinationType: "queue", queue: #{} })
      @channel("orders")
      interface OrderChannel {
        ${PUBLISH_ORDER_CREATED}
      }
    `);

    expect(bindingsOf(channelsOf(doc).orders.bindings).ibmmq).toEqual({
      destinationType: "queue",
      bindingVersion: "0.1.0",
    });
  });
});
