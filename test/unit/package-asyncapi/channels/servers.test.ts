import { describe, it, expect, beforeEach } from "vitest";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing.js";
import { diagnosticsWith, findDiagnostic } from "../../../utils/diagnostics.js";
import { documentFrom, emitDocumentWithDiagnostics } from "../../../utils/test-host.js";
import { resolveParameters } from "../../../utils/document.js";

describe("Unit: Channel servers (Phase 4.6)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("emits one reference for one @useServer", async () => {
    const { doc } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      @server("kafka-prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      @useServer("kafka-prod")
      interface OrderChannel {
        publish(event: OrderCreated): void;
      }
    `);

    expect(doc?.channels?.["orders.created"].servers).toEqual([{ $ref: "#/servers/kafka-prod" }]);
  });

  it("keeps two stacked applications in source order", async () => {
    const { doc } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      @server("kafka-prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
      @server("kafka-dr", #{ host: "kafka.dr.example.com:9092", protocol: "kafka" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      @useServer("kafka-prod")
      @useServer("kafka-dr")
      interface OrderChannel {
        publish(event: OrderCreated): void;
      }
    `);

    expect(doc?.channels?.["orders.created"].servers).toEqual([
      { $ref: "#/servers/kafka-prod" },
      { $ref: "#/servers/kafka-dr" },
    ]);
  });

  it("leaves the field out when the channel names no server", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        publish(event: OrderCreated): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(doc.channels?.["orders.created"]).not.toHaveProperty("servers");
  });

  it("emits one reference and warns when a name is given twice", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      @server("kafka-prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      @useServer("kafka-prod")
      @useServer("kafka-prod")
      interface OrderChannel {
        publish(event: OrderCreated): void;
      }
    `);

    const warning = findDiagnostic(diagnostics, "duplicate-use-server");

    expect(warning.severity).toBe("warning");
    expect(doc?.channels?.["orders.created"].servers).toEqual([{ $ref: "#/servers/kafka-prod" }]);
  });

  it("warns about a @useServer on a target with no channel", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @useServer("kafka-prod")
      interface OrderChannel {
        publish(event: OrderCreated): void;
      }
    `);

    await documentFrom(runner.program);
    const warning = findDiagnostic(diagnostics, "use-server-without-channel");

    expect(warning.severity).toBe("warning");
    expect(warning.message).toMatch(/kafka-prod/);
  });

  it("names every server on a target that carries no channel", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @useServer("kafka-prod")
      @useServer("kafka-dr")
      interface OrderChannel {
        publish(event: OrderCreated): void;
      }
    `);

    await documentFrom(runner.program);

    const reported = diagnosticsWith(diagnostics, "use-server-without-channel");

    // Each application names the server the author meant, so two stray
    // applications are two mistakes and get two reports. A single-application
    // test cannot tell that apart from reporting the target once.
    expect(reported).toHaveLength(2);
    expect(reported.map((d) => d.message).join(" ")).toMatch(/kafka-prod/);
    expect(reported.map((d) => d.message).join(" ")).toMatch(/kafka-dr/);
  });

  it("accepts every channel decorator in its augment form", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      @server("inline-a", #{ host: "a.example.com", protocol: "kafka" })
      @server("augment-b", #{ host: "b.example.com", protocol: "kafka" })
      @server("augment-c", #{ host: "c.example.com", protocol: "kafka" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @message
      model OrderAccepted {
        id: string;
      }

      @useServer("inline-a")
      interface OrderChannel {
        publish(region: "eu" | "us", event: OrderCreated): void;
      }

      interface ReplyChannel {
        receive(response: OrderAccepted): void;
      }

      @@channel(OrderChannel, "orders.{region}.created");
      @@useServer(OrderChannel, "augment-b");
      @@useServer(OrderChannel, "augment-c");
      @@parameterLocation(OrderChannel.publish::parameters.region, "$message.payload#/region");
      @@dynamicChannel(ReplyChannel);
    `);

    expect(diagnostics).toEqual([]);
    expect(doc?.channels?.["orders.{region}.created"].address).toBe("orders.{region}.created");
    expect(doc?.channels?.ReplyChannel.address).toBeNull();
    expect(resolveParameters(doc, doc?.channels?.["orders.{region}.created"].parameters)).toEqual({
      region: { enum: ["eu", "us"], location: "$message.payload#/region" },
    });
    // The checker splices augment applications in before the inline ones, so
    // the recorded order starts with the two augments. Sorting by source
    // position puts the inline application back in front of them.
    expect(doc?.channels?.["orders.{region}.created"].servers).toEqual([
      { $ref: "#/servers/inline-a" },
      { $ref: "#/servers/augment-b" },
      { $ref: "#/servers/augment-c" },
    ]);
  });
});
