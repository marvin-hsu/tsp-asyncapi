import { describe, it, expect, beforeEach } from "vitest";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing/index.js";
import { diagnosticsWith, findDiagnostic, targetText } from "../../../utils/diagnostics.js";
import { documentFrom } from "../../../utils/test-host.js";

describe("Unit: Channel parameters: address matching (Phase 4.3)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("omits parameters when the address holds no expression", async () => {
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

    const doc = documentFrom(runner.program);

    expect(doc.channels?.["orders.created"]).not.toHaveProperty("parameters");
  });

  it("reports a parameter the address never uses", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        publish(orderId: string, event: OrderCreated): void;
      }
    `);

    documentFrom(runner.program);

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/unused-channel-param");
  });

  it("reports an optional parameter in the middle of the address", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}.created")
      interface OrderChannel {
        publish(region?: string, event: OrderCreated): void;
      }
    `);

    documentFrom(runner.program);

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/optional-channel-param");
  });

  it("reports an optional parameter at the tail of the address", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}")
      interface OrderChannel {
        publish(region?: string, event: OrderCreated): void;
      }
    `);

    documentFrom(runner.program);

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/optional-channel-param");
  });

  it("points a parameter problem at the property that declares it", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{orderId}")
      interface OrderChannel {
        publish(orderId: int32, event: OrderCreated): void;
      }
    `);

    documentFrom(runner.program);
    const reported = findDiagnostic(diagnostics, "non-string-channel-param");

    expect(targetText(reported)).toBe("orderId: int32");
  });

  it("points a missing parameter at the address argument", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{orderId}", "orders")
      interface OrderChannel {
        publish(event: OrderCreated): void;
      }
    `);

    documentFrom(runner.program);
    const reported = findDiagnostic(diagnostics, "missing-channel-param");

    // The address is the place the author has to change, and no property
    // exists to point at.
    expect(targetText(reported)).toBe(`"orders.{orderId}"`);
  });

  it("treats one name written twice in an address as one parameter", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}.created.{region}")
      interface OrderChannel {
        publish(region: string, event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(diagnostics).toEqual([]);
    expect(doc.channels?.["orders.{region}.created.{region}"].parameters).toEqual({ region: {} });
  });

  it("reports one missing parameter for a name the address writes twice", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}.created.{region}")
      interface OrderChannel {
        publish(event: OrderCreated): void;
      }
    `);

    documentFrom(runner.program);

    expect(diagnosticsWith(diagnostics, "missing-channel-param")).toHaveLength(1);
  });

  it("keeps the parameters map in the order the address names them", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}.{tenant}.{orderId}")
      interface OrderChannel {
        publish(orderId: string, tenant: string, region: string, event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    // The operation declares the three in the opposite order to the address.
    // The address decides the emitted order, so this input fails if the map
    // is ever built from the declarations instead.
    expect(
      Object.keys(doc.channels?.["orders.{region}.{tenant}.{orderId}"].parameters ?? {}),
    ).toEqual(["region", "tenant", "orderId"]);
  });
});
