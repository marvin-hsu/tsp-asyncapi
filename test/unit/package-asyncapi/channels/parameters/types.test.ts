import { describe, it, expect, beforeEach } from "vitest";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing.js";
import { diagnosticsWith } from "../../../../utils/diagnostics.js";
import { documentFrom } from "../../../../utils/test-host.js";
import { resolveParameters } from "../../../../utils/document.js";

describe("Unit: Channel parameters: value types (Phase 4.3)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("builds every field of a Parameter Object", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      enum Region {
        eu: "eu",
        us: "us",
      }

      @channel("orders.{region}.{orderId}.created")
      interface OrderChannel {
        publish(
          @doc("Where the order was placed.")
          @parameterLocation("$message.payload#/region")
          region: Region = Region.eu,

          @doc("The order this event is about.")
          @example("1234")
          orderId: string,

          event: OrderCreated,
        ): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(
      resolveParameters(doc, doc.channels?.["orders.{region}.{orderId}.created"].parameters),
    ).toEqual({
      region: {
        enum: ["eu", "us"],
        default: "eu",
        description: "Where the order was placed.",
        location: "$message.payload#/region",
      },
      orderId: {
        description: "The order this event is about.",
        examples: ["1234"],
      },
    });
  });

  it("takes the enum of a union of string literals", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}")
      interface OrderChannel {
        publish(region: "eu" | "us", event: OrderCreated): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(resolveParameters(doc, doc.channels?.["orders.{region}"].parameters)).toEqual({
      region: { enum: ["eu", "us"] },
    });
  });

  it("emits no enum for a plain string parameter", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{orderId}")
      interface OrderChannel {
        publish(orderId: string, event: OrderCreated): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(resolveParameters(doc, doc.channels?.["orders.{orderId}"].parameters)).toEqual({
      orderId: {},
    });
  });

  it("accepts a user scalar that extends string", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      scalar orderId extends string;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{id}")
      interface OrderChannel {
        publish(id: orderId, event: OrderCreated): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(resolveParameters(doc, doc.channels?.["orders.{id}"].parameters)).toEqual({ id: {} });
  });

  it("reports a parameter that is not a string", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{orderId}")
      interface OrderChannel {
        publish(orderId: int32 = 7, event: OrderCreated): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    // `default` is typed as a string in a Parameter Object, so a numeric
    // default is left out along with the rest of the declaration.
    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/non-string-channel-param");
    expect(resolveParameters(doc, doc.channels?.["orders.{orderId}"].parameters)).toEqual({
      orderId: {},
    });
  });

  it("reports an enum backed by numbers", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      enum Priority {
        low: 1,
        high: 2,
      }

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{priority}")
      interface OrderChannel {
        publish(priority: Priority, event: OrderCreated): void;
      }
    `);

    await documentFrom(runner.program);

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/non-string-channel-param");
  });

  it("takes a string literal default as it is written", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}")
      interface OrderChannel {
        publish(region: string = "eu", event: OrderCreated): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(resolveParameters(doc, doc.channels?.["orders.{region}"].parameters)).toEqual({
      region: { default: "eu" },
    });
  });

  it("takes the name of an enum member that carries no value", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      enum Region {
        eu,
        us,
      }

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}")
      interface OrderChannel {
        publish(region: Region = Region.eu, event: OrderCreated): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(resolveParameters(doc, doc.channels?.["orders.{region}"].parameters)).toEqual({
      region: { enum: ["eu", "us"], default: "eu" },
    });
  });

  it("emits no enum for a union that mixes a plain string into its variants", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}")
      interface OrderChannel {
        publish(region: "eu" | string, event: OrderCreated): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    // The union is still a string type, so it is not reported. It no longer
    // names a limited set, so no `enum` describes it.
    expect(diagnostics.map((d) => d.code)).not.toContain("tsp-asyncapi/non-string-channel-param");
    expect(resolveParameters(doc, doc.channels?.["orders.{region}"].parameters)).toEqual({
      region: {},
    });
  });

  it("rejects a union that mixes a non-string variant into its variants", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}")
      interface OrderChannel {
        publish(region: "eu" | int32, event: OrderCreated): void;
      }
    `);

    const doc = await documentFrom(runner.program);
    const reported = diagnosticsWith(diagnostics, "non-string-channel-param");

    // One non-string variant makes the whole union a non-string type. The
    // union is rejected whole, rather than emitted as an `enum` that names
    // the string variants alone.
    expect(reported).toHaveLength(1);
    expect(resolveParameters(doc, doc.channels?.["orders.{region}"].parameters)).toEqual({
      region: {},
    });
  });

  it("names the values of a parameter typed as one enum member", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      enum Region {
        eu: "eu",
        us: "us",
      }

      @channel("orders.{region}")
      interface OrderChannel {
        publish(region: Region.eu, event: OrderCreated): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    // A member names one string, so it names a set of one. The whole-enum
    // form already worked. The member form fell through to the default arm
    // and was reported as a non-string parameter.
    expect(resolveParameters(doc, doc.channels?.["orders.{region}"].parameters)).toEqual({
      region: { enum: ["eu"] },
    });
  });

  it("rejects a parameter typed as a numeric enum member", async () => {
    // A member whose value is a number names no string, so it is not a
    // string type. `stringValuesOf` returns `undefined` for it, and the
    // parameter is reported like any other non-string type. This is the
    // same rule the whole-enum form follows. The existing member test uses
    // a string-valued member, which takes the other side of the check.
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      enum Region {
        one: 1,
      }

      @channel("orders.{region}")
      interface OrderChannel {
        publish(region: Region.one, event: OrderCreated): void;
      }
    `);

    await documentFrom(runner.program);

    expect([...diagnostics, ...runner.program.diagnostics].map((d) => d.code)).toContain(
      "tsp-asyncapi/non-string-channel-param",
    );
  });

  it("names the values of a parameter typed as a union of enum members", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      enum Region {
        eu: "eu",
        us: "us",
        apac: "apac",
      }

      @channel("orders.{region}")
      interface OrderChannel {
        publish(region: Region.eu | Region.us, event: OrderCreated): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(resolveParameters(doc, doc.channels?.["orders.{region}"].parameters)).toEqual({
      region: { enum: ["eu", "us"] },
    });
  });

  it("rejects a user scalar that is named string in its own namespace", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      namespace Inner {
        scalar string;
      }

      @channel("orders.{region}")
      interface OrderChannel {
        publish(region: Inner.string, event: OrderCreated): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    // The built-in check is by namespace, not by name. A scalar the author
    // declared and happened to call `string` is not the built-in one, and it
    // carries no promise of being a string at all.
    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/non-string-channel-param");
    expect(resolveParameters(doc, doc.channels?.["orders.{region}"].parameters)).toEqual({
      region: {},
    });
  });

  it("rejects a parameter typed as a model", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      model Region {
        code: string;
      }

      @channel("orders.{region}")
      interface OrderChannel {
        publish(region: Region, event: OrderCreated): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    // A model is neither a string, a scalar, an enum nor a union, so it
    // reaches the last arm of the value reader. Nothing else in this suite
    // gets there.
    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/non-string-channel-param");
    expect(resolveParameters(doc, doc.channels?.["orders.{region}"].parameters)).toEqual({
      region: {},
    });
  });
});
