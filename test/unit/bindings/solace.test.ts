import { describe, expect, it } from "vitest";
import { emitDocument, emitDocumentWithDiagnostics } from "../../utils/test-host.js";
import { findDiagnostic } from "../../utils/diagnostics.js";
import { operationsOf, serversOf } from "../../utils/document.js";

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

describe("Unit: the Solace binding decorators", () => {
  it("emits both levels with the binding version", async () => {
    const doc = await emitDocument(`
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
    expect(serversOf(doc).prod.bindings?.solace).toEqual({
      msgVpn: "orders-vpn",
      clientName: "order-service",
      bindingVersion: "0.4.0",
    });
    expect(operationsOf(doc).publish.bindings?.solace).toEqual({
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
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
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

    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("destinations[0].deliveryMode");
    expect(reported.message).toContain("direct or persistent");
    // The entry still names the destination the author wrote.
    expect(operationsOf(doc).publish.bindings?.solace.destinations).toEqual([
      { destinationType: "topic" },
    ]);
  });

  it("reports a client name longer than Solace allows", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
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

    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("clientName");
    expect(reported.message).toContain("at most 160 characters");
  });

  it("reports a negative priority", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${service("smf")}

      @channel("orders")
      interface OrderChannel {
        @solaceOperation(#{ priority: -1 })
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("priority");
    expect(reported.message).toContain("zero or more");
  });

  it("drops a destination list left with no entry", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      ${service("smf")}

      @channel("orders")
      interface OrderChannel {
        @solaceOperation(#{ destinations: #["not-an-object"], timeToLive: 60000 })
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    findDiagnostic(diagnostics, "invalid-binding-field");
    expect(operationsOf(doc).publish.bindings?.solace).toEqual({
      timeToLive: 60000,
      bindingVersion: "0.4.0",
    });
  });
});
