import { describe, it, expect, beforeEach } from "vitest";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing/index.js";
import { diagnosticsWith, findDiagnostic, targetText } from "../../../../utils/diagnostics.js";
import { documentFrom } from "../../../../utils/test-host.js";

describe("Unit: Channel parameters: disagreeing declarations (Phase 4.3)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("reports an expression that no operation declares", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{orderId}")
      interface OrderChannel {
        publish(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/missing-channel-param");
    // The map still covers the whole address, so the document stays readable.
    expect(doc.channels?.["orders.{orderId}"].parameters).toEqual({ orderId: {} });
  });

  it("reports every declaration of a parameter the address never uses", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @message
      model OrderCancelled {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        publish(region: string, event: OrderCreated): void;
        subscribe(region: string, event: OrderCancelled): void;
      }
    `);

    documentFrom(runner.program);
    const reported = diagnosticsWith(diagnostics, "unused-channel-param");

    // Each operation carries its own property, so each of them is a place
    // the author has to change.
    expect(reported).toHaveLength(2);
  });

  it("reports an optional parameter declared by the second operation", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @message
      model OrderCancelled {
        id: string;
      }

      @channel("orders.{orderId}")
      interface OrderChannel {
        publish(orderId: string, event: OrderCreated): void;
        subscribe(orderId?: string, event: OrderCancelled): void;
      }
    `);

    const doc = documentFrom(runner.program);
    const reported = diagnosticsWith(diagnostics, "optional-channel-param");

    // Every declaration of a name the address uses is checked. An optional
    // parameter is wrong wherever it sits, so which operation declares it
    // first must not decide whether the author hears about it.
    expect(reported).toHaveLength(1);
    expect(targetText(reported[0])).toBe("orderId?: string");
    expect(doc.channels?.["orders.{orderId}"].parameters).toEqual({ orderId: {} });
  });

  it("reports a non-string parameter declared by the second operation", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @message
      model OrderCancelled {
        id: string;
      }

      @channel("orders.{orderId}")
      interface OrderChannel {
        publish(orderId: string, event: OrderCreated): void;
        subscribe(orderId: int32, event: OrderCancelled): void;
      }
    `);

    const doc = documentFrom(runner.program);
    const reported = diagnosticsWith(diagnostics, "non-string-channel-param");

    // The two declarations also disagree, and that is reported too. The
    // disagreement alone would leave the author free to change the string
    // one into an `int32`, which is the illegal declaration of the two.
    expect(reported).toHaveLength(1);
    expect(targetText(reported[0])).toBe("orderId: int32");
    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/conflicting-channel-param");
    expect(doc.channels?.["orders.{orderId}"].parameters).toEqual({ orderId: {} });
  });

  it("keeps the first declaration when two operations disagree", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}")
      interface OrderChannel {
        publish(@doc("First") region: string, event: OrderCreated): void;
        republish(@doc("Second") region: string, event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);
    const conflict = findDiagnostic(diagnostics, "conflicting-channel-param");

    expect(conflict.message).toMatch(/description/);
    expect(doc.channels?.["orders.{region}"].parameters).toEqual({
      region: { description: "First" },
    });
  });

  it("names every field two declarations disagree about", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}")
      interface OrderChannel {
        publish(
          @doc("First")
          @example("eu")
          @parameterLocation("$message.payload#/first")
          region: "eu" | "us" = "eu",

          event: OrderCreated,
        ): void;

        republish(
          @doc("Second")
          @example("uk")
          @parameterLocation("$message.payload#/second")
          region: "eu" | "us" | "uk" = "us",

          event: OrderCreated,
        ): void;
      }
    `);

    const doc = documentFrom(runner.program);
    const conflicts = diagnosticsWith(diagnostics, "conflicting-channel-param");

    expect(conflicts.map((d) => /a different '(\w+)'/.exec(d.message)?.[1])).toEqual([
      "type",
      "default",
      "description",
      "examples",
      "location",
    ]);
    // The first declaration in source order is the one that reaches the
    // document, field by field.
    expect(doc.channels?.["orders.{region}"].parameters).toEqual({
      region: {
        enum: ["eu", "us"],
        default: "eu",
        description: "First",
        examples: ["eu"],
        location: "$message.payload#/first",
      },
    });
  });

  it("accepts two operations that write one parameter type inline", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @message
      model OrderCancelled {
        id: string;
      }

      @channel("orders.{region}.changed")
      interface OrderChannel {
        publish(region: "eu" | "us", event: OrderCreated): void;
        subscribe(region: "eu" | "us", event: OrderCancelled): void;
      }
    `);

    const doc = documentFrom(runner.program);

    // The two unions are separate TypeSpec objects, because each operation
    // writes its own. They allow the same values, so they agree.
    expect(diagnostics).toEqual([]);
    expect(doc.channels?.["orders.{region}.changed"].parameters).toEqual({
      region: { enum: ["eu", "us"] },
    });
  });

  it("accepts two operations that declare one parameter the same way", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}")
      interface OrderChannel {
        publish(region: string, event: OrderCreated): void;
        republish(region: string, event: OrderCreated): void;
      }
    `);

    documentFrom(runner.program);

    expect(diagnostics).toEqual([]);
  });

  it("reports two declarations that name the same values in a different order", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}")
      interface OrderChannel {
        publish(region: "eu" | "us", event: OrderCreated): void;
        subscribe(region: "us" | "eu", event: OrderCreated): void;
      }
    `);

    documentFrom(runner.program);

    // The two declarations name the same set, so a comparison that sorted
    // first would call them equal. They are not: the order is the order the
    // emitted `enum` array carries, and only one of the two can be emitted.
    const reported = diagnosticsWith(diagnostics, "conflicting-channel-param");
    expect(reported).toHaveLength(1);
    expect(reported[0].message).toContain("type");
  });
});
