import { describe, it } from "vitest";
import { serverProtocolMismatchRule } from "#core/linter/server-protocol-mismatch.rule.js";
import { createRuleTester } from "../../../utils/linter.js";

/**
 * Unit tests of `tsp-asyncapi/server-protocol-mismatch`.
 *
 * A server-level binding is recorded against the namespace, so every server
 * the namespace declares receives it. Most of these cases pin the reporting
 * granularity that follows from that.
 */
describe("Unit: the server-protocol-mismatch rule", () => {
  it("stays quiet when the binding matches the server protocol", async () => {
    const tester = await createRuleTester(serverProtocolMismatchRule);
    await tester
      .expect(
        `
        @service(#{ title: "Orders" })
        @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
        @kafkaServer(#{ schemaRegistryUrl: "https://registry.example.com" })
        namespace Test;
      `,
      )
      .toBeValid();
  });

  /** The mistake: a Kafka binding on a namespace that speaks only MQTT. */
  it("reports a binding no server on the namespace speaks", async () => {
    const tester = await createRuleTester(serverProtocolMismatchRule);
    await tester
      .expect(
        `
        @service(#{ title: "Orders" })
        @server("prod", #{ host: "mqtt.example.com:1883", protocol: "mqtt" })
        @kafkaServer(#{ schemaRegistryUrl: "https://registry.example.com" })
        namespace Test;
      `,
      )
      .toEmitDiagnostics({ code: "tsp-asyncapi/server-protocol-mismatch" });
  });

  /**
   * The secure transport is the same protocol. AsyncAPI names it separately,
   * and the same binding configures it, so the table pairs them.
   */
  it("accepts the secure variant of the protocol", async () => {
    const tester = await createRuleTester(serverProtocolMismatchRule);
    await tester
      .expect(
        `
        @service(#{ title: "Orders" })
        @server("prod", #{ host: "kafka.example.com:9093", protocol: "kafka-secure" })
        @kafkaServer(#{ schemaRegistryUrl: "https://registry.example.com" })
        namespace Test;
      `,
      )
      .toBeValid();
  });

  /**
   * The case that makes this a per-namespace rule. Both servers receive the
   * Kafka binding because it is recorded against the namespace, and the
   * author asked for exactly that. Reporting per server would flag the MQTT
   * one.
   */
  it("stays quiet when one of several servers matches", async () => {
    const tester = await createRuleTester(serverProtocolMismatchRule);
    await tester
      .expect(
        `
        @service(#{ title: "Orders" })
        @server("kafka", #{ host: "kafka.example.com:9092", protocol: "kafka" })
        @server("mqtt", #{ host: "mqtt.example.com:1883", protocol: "mqtt" })
        @kafkaServer(#{ schemaRegistryUrl: "https://registry.example.com" })
        namespace Test;
      `,
      )
      .toBeValid();
  });

  /**
   * The binding member name is not always the protocol name. Solace's
   * binding is `solace` and the protocol it configures is `smf`. The table
   * had this row wrong, and `examples/14-streaming-platforms` caught it, so
   * the pairing is pinned here.
   */
  it("pairs the solace binding with the smf protocol", async () => {
    const tester = await createRuleTester(serverProtocolMismatchRule);
    await tester
      .expect(
        `
        @service(#{ title: "Telemetry" })
        @server("broker", #{ host: "solace.example.com:55555", protocol: "smf" })
        @solaceServer(#{ msgVpn: "telemetry-vpn", clientName: "sensor-stream" })
        namespace Test;
      `,
      )
      .toBeValid();
  });

  /**
   * A channel-level binding says nothing about a server, and v1 does not
   * check the channel level at all.
   */
  it("ignores a binding that is not at the server level", async () => {
    const tester = await createRuleTester(serverProtocolMismatchRule);
    await tester
      .expect(
        `
        @service(#{ title: "Orders" })
        @server("prod", #{ host: "mqtt.example.com:1883", protocol: "mqtt" })
        namespace Test;

        @message
        model OrderCreated {
          id: string;
        }

        @channel("orders.created")
        @kafkaChannel(#{ topic: "orders" })
        interface OrderChannel {
          @send
          op publish(event: OrderCreated): void;
        }
      `,
      )
      .toBeValid();
  });

  /**
   * A binding on a namespace with no server is already reported by
   * `binding-outside-document`, and there is no protocol to compare against
   * anyway.
   */
  it("stays quiet on a namespace that declares no server", async () => {
    const tester = await createRuleTester(serverProtocolMismatchRule);
    await tester
      .expect(
        `
        @service(#{ title: "Orders" })
        namespace Test;

        @kafkaServer(#{ schemaRegistryUrl: "https://registry.example.com" })
        namespace Test.NoServers {}
      `,
      )
      .toBeValid();
  });

  /**
   * `@server` checks its protocol only for being non-blank, so the author
   * chooses the case. The comparison lowercases both sides.
   */
  it("accepts a protocol written in another case", async () => {
    const tester = await createRuleTester(serverProtocolMismatchRule);
    await tester
      .expect(
        `
        @service(#{ title: "Orders" })
        @server("prod", #{ host: "kafka.example.com:9092", protocol: "KAFKA" })
        @kafkaServer(#{ schemaRegistryUrl: "https://registry.example.com" })
        namespace Test;
      `,
      )
      .toBeValid();
  });
});
