import { beforeEach, describe, expect, it } from "vitest";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing.js";
import { listServices } from "@typespec/compiler";
import { buildAsyncAPIDocument } from "#emitter/pipeline.js";
import { diagnosticsWith } from "../../../utils/diagnostics.js";
import { documentFrom } from "../../../utils/test-host.js";
import { bindingsOf } from "../../../utils/document.js";

/**
 * These drive the builder directly, the way the other unit suites do.
 *
 * The suites beside this one go through the emitter, which loads the build
 * output. Both routes matter: the emitter is what a user runs, and the direct
 * call is what pins the assembly rules on their own, without a file write in
 * between.
 */
describe("Unit: assembling a Bindings Object", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("puts every protocol of one channel in source order", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @binding("mqtt", #{ qos: 1 })
      @binding("amqp", #{ expiration: 100 })
      @kafkaChannel(#{ topic: "orders.created", partitions: 3 })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    const bindings = doc.channels?.["orders.created"].bindings as Record<string, unknown>;
    // The members read in the order the author wrote the decorators, so the
    // emitted document is the same on every run.
    expect(Object.keys(bindings)).toEqual(["mqtt", "amqp", "kafka"]);
    expect(bindings.kafka).toEqual({
      topic: "orders.created",
      partitions: 3,
      bindingVersion: "0.5.0",
    });
    // Only a Kafka decorator knows which version its fields come from, so the
    // generic decorator adds none.
    expect(bindings.mqtt).toEqual({ qos: 1 });
  });

  it("omits the field when a target carries no binding", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    // An empty Bindings Object states nothing, so the field is left out.
    expect(doc.channels?.["orders.created"]).not.toHaveProperty("bindings");
    expect(doc.operations?.publish).not.toHaveProperty("bindings");
  });

  it("keeps the first application when one protocol is claimed twice", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @binding("kafka", #{ topic: "first" })
      @kafkaChannel(#{ topic: "second" })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    // The two are never merged, and the later one never wins.
    const bindings = doc.channels?.["orders.created"].bindings as Record<string, unknown>;
    expect(bindings.kafka).toEqual({ topic: "first" });
    expect(diagnosticsWith(runner.program.diagnostics, "duplicate-binding").length).toBeGreaterThan(
      0,
    );
  });

  it("reaches a server, a message, and an operation from one program", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
      @kafkaServer(#{ schemaRegistryUrl: "https://registry.example.com" })
      namespace Test;

      @kafkaMessage(#{ schemaIdLocation: "payload" })
      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @kafkaOperation(#{ groupId: #{ type: "string" } })
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, listServices(runner.program)[0], {});

    expect(bindingsOf(doc.servers?.prod.bindings).kafka).toEqual({
      schemaRegistryUrl: "https://registry.example.com",
      bindingVersion: "0.5.0",
    });
    expect(bindingsOf(doc.components?.messages?.OrderCreated.bindings).kafka).toEqual({
      schemaIdLocation: "payload",
      bindingVersion: "0.5.0",
    });
    expect(bindingsOf(doc.operations?.publish.bindings).kafka).toEqual({
      groupId: { type: "string" },
      bindingVersion: "0.5.0",
    });
  });
  /**
   * Every renderer, driven from the source tree.
   *
   * The suites beside this one reach a renderer through the emitter, which
   * loads the build output. So a renderer wired into the map wrongly would
   * still pass there while the `src` copy of the map was never run. This test
   * runs the map itself, once per protocol.
   *
   * A protocol added to `BindingRenderer` without an entry here leaves its
   * renderer unexercised from source. The compile-time check on the map
   * catches a missing entry; this catches a wrong one.
   */
  it("runs the renderer of every protocol from the source tree", async () => {
    await runner.compile(`
      @service(#{ title: "Everything" })
      @mqttServer(#{ clientId: "gateway" })
      @pulsarServer(#{ tenant: "orders" })
      @jmsServer(#{ jmsConnectionFactory: "com.example.Factory" })
      @ibmMqServer(#{ groupId: "PRODCLSTR1" })
      @solaceServer(#{ msgVpn: "orders-vpn" })
      @server("prod", #{ host: "broker.example.com", protocol: "mqtt" })
      namespace Test;

      @kafkaMessage(#{ schemaIdLocation: "payload" })
      @mqttMessage(#{ contentType: "application/json" })
      @amqpMessage(#{ messageType: "order.created" })
      @httpMessage(#{ statusCode: 201 })
      @googlePubSubMessage(#{ orderingKey: "customer-id" })
      @anypointMqMessage(#{ headers: #{ type: "object" } })
      @jmsMessage(#{ headers: #{ type: "object" } })
      @ibmMqMessage(#{ type: "jms" })
      @message
      model OrderCreated {
        id: string;
      }

      @websocketChannel(#{ method: "GET" })
      @amqpChannel(#{ \`is\`: "routingKey" })
      @sqsChannel(#{ queue: #{ name: "orders", fifoQueue: false } })
      @pulsarChannel(#{ \`namespace\`: "orders", persistence: "persistent" })
      @googlePubSubChannel(#{
        schemaSettings: #{ encoding: "json", name: "projects/p/schemas/order" }
      })
      @anypointMqChannel(#{ destination: "orders" })
      @jmsChannel(#{ destination: "orders" })
      @ibmMqChannel(#{ destinationType: "queue" })
      @binding("custom", #{ anything: true })
      @channel("orders.created")
      interface OrderChannel {
        @kafkaOperation(#{ groupId: #{ type: "string" } })
        @mqttOperation(#{ qos: 1 })
        @amqpOperation(#{ deliveryMode: 2 })
        @httpOperation(#{ method: "POST" })
        @natsOperation(#{ queue: "workers" })
        @sqsOperation(#{ queues: #[#{ name: "orders" }] })
        @solaceOperation(#{ timeToLive: 60000 })
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, listServices(runner.program)[0], {});

    const server = bindingsOf(doc.servers?.prod.bindings);
    const channel = bindingsOf(doc.channels?.["orders.created"].bindings);
    const operation = bindingsOf(doc.operations?.publish.bindings);
    const message = bindingsOf(doc.components?.messages?.OrderCreated.bindings);

    // Each renderer stamps the version of its own specification. A protocol
    // wired to another one's renderer would carry the wrong number here.
    expect(server.mqtt).toEqual({ clientId: "gateway", bindingVersion: "0.2.0" });
    expect(server.pulsar).toEqual({ tenant: "orders", bindingVersion: "0.1.0" });
    expect(server.jms).toEqual({
      jmsConnectionFactory: "com.example.Factory",
      bindingVersion: "0.0.1",
    });
    expect(server.ibmmq).toEqual({ groupId: "PRODCLSTR1", bindingVersion: "0.1.0" });
    expect(server.solace).toEqual({ msgVpn: "orders-vpn", bindingVersion: "0.4.0" });

    expect(channel.ws).toEqual({ method: "GET", bindingVersion: "0.1.0" });
    expect(channel.amqp).toEqual({ is: "routingKey", bindingVersion: "0.3.0" });
    expect(channel.sqs).toEqual({
      queue: { name: "orders", fifoQueue: false },
      bindingVersion: "0.2.0",
    });
    expect(channel.pulsar).toEqual({
      namespace: "orders",
      persistence: "persistent",
      bindingVersion: "0.1.0",
    });
    expect(channel.googlepubsub).toEqual({
      schemaSettings: { encoding: "json", name: "projects/p/schemas/order" },
      bindingVersion: "0.2.0",
    });
    expect(channel.anypointmq).toEqual({ destination: "orders", bindingVersion: "0.0.1" });
    expect(channel.jms).toEqual({ destination: "orders", bindingVersion: "0.0.1" });
    expect(channel.ibmmq).toEqual({ destinationType: "queue", bindingVersion: "0.1.0" });
    // The generic decorator is emitted as written, with no version added.
    expect(channel.custom).toEqual({ anything: true });

    expect(operation.kafka).toEqual({ groupId: { type: "string" }, bindingVersion: "0.5.0" });
    expect(operation.mqtt).toEqual({ qos: 1, bindingVersion: "0.2.0" });
    expect(operation.amqp).toEqual({ deliveryMode: 2, bindingVersion: "0.3.0" });
    expect(operation.http).toEqual({ method: "POST", bindingVersion: "0.3.0" });
    expect(operation.nats).toEqual({ queue: "workers", bindingVersion: "0.1.0" });
    expect(operation.sqs).toEqual({ queues: [{ name: "orders" }], bindingVersion: "0.2.0" });
    expect(operation.solace).toEqual({ timeToLive: 60000, bindingVersion: "0.4.0" });

    expect(message.kafka).toEqual({ schemaIdLocation: "payload", bindingVersion: "0.5.0" });
    expect(message.mqtt).toEqual({ contentType: "application/json", bindingVersion: "0.2.0" });
    expect(message.amqp).toEqual({ messageType: "order.created", bindingVersion: "0.3.0" });
    expect(message.http).toEqual({ statusCode: 201, bindingVersion: "0.3.0" });
    expect(message.anypointmq).toEqual({
      headers: { type: "object" },
      bindingVersion: "0.0.1",
    });
    expect(message.jms).toEqual({ headers: { type: "object" }, bindingVersion: "0.0.1" });
    expect(message.ibmmq).toEqual({ type: "jms", bindingVersion: "0.1.0" });
    expect(message.googlepubsub).toEqual({
      orderingKey: "customer-id",
      bindingVersion: "0.2.0",
    });
  });
});
