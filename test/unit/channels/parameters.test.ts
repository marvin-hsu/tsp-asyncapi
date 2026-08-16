import { describe, it, expect, beforeEach } from "vitest";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "../../../src/testing/index.js";
import { buildAsyncAPIDocument } from "../../../src/builders/document.js";
import { findDiagnostic, targetText } from "../../utils/diagnostics.js";

describe("Unit: Channel parameters (Phase 4.3)", () => {
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.channels?.OrderChannel.parameters).toEqual({
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.channels?.OrderChannel.parameters).toEqual({ region: { enum: ["eu", "us"] } });
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.channels?.OrderChannel.parameters).toEqual({ orderId: {} });
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.channels?.OrderChannel.parameters).toEqual({ id: {} });
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.channels?.OrderChannel).not.toHaveProperty("parameters");
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/missing-channel-param");
    // The map still covers the whole address, so the document stays readable.
    expect(doc.channels?.OrderChannel.parameters).toEqual({ orderId: {} });
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

    buildAsyncAPIDocument(runner.program, undefined, {});

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/unused-channel-param");
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // `default` is typed as a string in a Parameter Object, so a numeric
    // default is left out along with the rest of the declaration.
    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/non-string-channel-param");
    expect(doc.channels?.OrderChannel.parameters).toEqual({ orderId: {} });
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

    buildAsyncAPIDocument(runner.program, undefined, {});

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/non-string-channel-param");
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

    buildAsyncAPIDocument(runner.program, undefined, {});

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

    buildAsyncAPIDocument(runner.program, undefined, {});

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/optional-channel-param");
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

    buildAsyncAPIDocument(runner.program, undefined, {});
    const reported = diagnostics.filter((d) => d.code === "tsp-asyncapi/unused-channel-param");

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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    const reported = diagnostics.filter((d) => d.code === "tsp-asyncapi/optional-channel-param");

    // Every declaration of a name the address uses is checked. An optional
    // parameter is wrong wherever it sits, so which operation declares it
    // first must not decide whether the author hears about it.
    expect(reported).toHaveLength(1);
    expect(targetText(reported[0])).toBe("orderId?: string");
    expect(doc.channels?.OrderChannel.parameters).toEqual({ orderId: {} });
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    const reported = diagnostics.filter((d) => d.code === "tsp-asyncapi/non-string-channel-param");

    // The two declarations also disagree, and that is reported too. The
    // disagreement alone would leave the author free to change the string
    // one into an `int32`, which is the illegal declaration of the two.
    expect(reported).toHaveLength(1);
    expect(targetText(reported[0])).toBe("orderId: int32");
    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/conflicting-channel-param");
    expect(doc.channels?.OrderChannel.parameters).toEqual({ orderId: {} });
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

    buildAsyncAPIDocument(runner.program, undefined, {});
    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/non-string-channel-param");

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

    buildAsyncAPIDocument(runner.program, undefined, {});
    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/missing-channel-param");

    // The address is the place the author has to change, and no property
    // exists to point at.
    expect(targetText(reported)).toBe(`"orders.{orderId}"`);
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    const conflict = diagnostics.find((d) => d.code === "tsp-asyncapi/conflicting-channel-param");

    expect(conflict?.message).toMatch(/description/);
    expect(doc.channels?.OrderChannel.parameters).toEqual({
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    const conflicts = diagnostics.filter(
      (d) => d.code === "tsp-asyncapi/conflicting-channel-param",
    );

    expect(conflicts.map((d) => /a different '(\w+)'/.exec(d.message)?.[1])).toEqual([
      "type",
      "default",
      "description",
      "examples",
      "location",
    ]);
    // The first declaration in source order is the one that reaches the
    // document, field by field.
    expect(doc.channels?.OrderChannel.parameters).toEqual({
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // The two unions are separate TypeSpec objects, because each operation
    // writes its own. They allow the same values, so they agree.
    expect(diagnostics).toEqual([]);
    expect(doc.channels?.OrderChannel.parameters).toEqual({ region: { enum: ["eu", "us"] } });
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

    buildAsyncAPIDocument(runner.program, undefined, {});

    expect(diagnostics).toEqual([]);
  });

  it("rejects a location that is not a runtime expression", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{orderId}")
      interface OrderChannel {
        publish(@parameterLocation("payload/id") orderId: string, event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/invalid-parameter-location");
    expect(doc.channels?.OrderChannel.parameters).toEqual({ orderId: {} });
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.channels?.OrderChannel.parameters).toEqual({ region: { default: "eu" } });
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.channels?.OrderChannel.parameters).toEqual({
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // The union is still a string type, so it is not reported. It no longer
    // names a limited set, so no `enum` describes it.
    expect(diagnostics.map((d) => d.code)).not.toContain("tsp-asyncapi/non-string-channel-param");
    expect(doc.channels?.OrderChannel.parameters).toEqual({ region: {} });
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(diagnostics).toEqual([]);
    expect(doc.channels?.OrderChannel.parameters).toEqual({ region: {} });
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

    buildAsyncAPIDocument(runner.program, undefined, {});

    expect(diagnostics.filter((d) => d.code === "tsp-asyncapi/missing-channel-param")).toHaveLength(
      1,
    );
  });

  it("drops an example it cannot serialize, and reports it", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      scalar ipv4 extends string {
        init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
      }

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{source}")
      interface OrderChannel {
        publish(@example(ipv4.fromBytes(1, 2, 3, 4)) source: ipv4, event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    const reported = diagnostics.filter((d) => d.code === "tsp-asyncapi/unserializable-example");

    expect(reported).toHaveLength(1);
    expect(reported[0].severity).toBe("warning");
    expect(doc.channels?.OrderChannel.parameters).toEqual({ source: {} });
  });

  it("leaves out an example that does not serialize to a string", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{orderId}")
      interface OrderChannel {
        publish(@example(1234) orderId: int32, event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // AsyncAPI types `examples` as strings, so the number has no place in it.
    // The type itself is the mistake the author is told about.
    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/non-string-channel-param");
    expect(doc.channels?.OrderChannel.parameters).toEqual({ orderId: {} });
  });

  it("accepts a header location and an empty pointer", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}.{tenant}")
      interface OrderChannel {
        publish(
          @parameterLocation("$message.header#/region") region: string,
          @parameterLocation("$message.header#") tenant: string,
          event: OrderCreated,
        ): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(diagnostics).toEqual([]);
    expect(doc.channels?.OrderChannel.parameters).toEqual({
      region: { location: "$message.header#/region" },
      tenant: { location: "$message.header#" },
    });
  });

  it("rejects a location that leaves out the fragment", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}")
      interface OrderChannel {
        publish(@parameterLocation("$message.header") region: string, event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // The normative JSON Schema of AsyncAPI requires the `#`, and the
    // official parser rejects a document without it.
    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/invalid-parameter-location");
    expect(doc.channels?.OrderChannel.parameters).toEqual({ region: {} });
  });

  it("reports a second @parameterLocation on one property", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{orderId}")
      interface OrderChannel {
        publish(
          @parameterLocation("$message.payload#/a")
          @parameterLocation("$message.payload#/b")
          orderId: string,

          event: OrderCreated,
        ): void;
      }
    `);

    expect(diagnostics.map((d) => d.code)).toContain(
      "tsp-asyncapi/duplicate-parameter-location-decorator",
    );
  });

  it("reports an unserializable example once when two operations declare the parameter", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      scalar ipv4 extends string {
        init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
      }

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{source}")
      interface OrderChannel {
        publish(@example(ipv4.fromBytes(1, 2, 3, 4)) source: ipv4, event: OrderCreated): void;
        republish(source: ipv4, event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    const reported = diagnostics.filter((d) => d.code === "tsp-asyncapi/unserializable-example");

    // Two operations declare `source`, so the first declaration is read
    // twice: once to compare it with the second, and once to emit it. The
    // reader keeps what it has already read, so the one mistake is reported
    // once. Without that, the author sees the same warning twice.
    expect(reported).toHaveLength(1);
    expect(doc.channels?.OrderChannel.parameters).toEqual({ source: {} });
  });

  it("keeps two examples of one parameter in source order", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}")
      interface OrderChannel {
        publish(@example("eu") @example("us") region: string, event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // Stacked decorators run bottom-up, so the recorded order is `us` then
    // `eu`. The emitted array is sorted back into source order.
    expect(doc.channels?.OrderChannel.parameters).toEqual({ region: { examples: ["eu", "us"] } });
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    const reported = diagnostics.filter((d) => d.code === "tsp-asyncapi/non-string-channel-param");

    // One non-string variant makes the whole union a non-string type. The
    // union is rejected whole, rather than emitted as an `enum` that names
    // the string variants alone.
    expect(reported).toHaveLength(1);
    expect(doc.channels?.OrderChannel.parameters).toEqual({ region: {} });
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // A member names one string, so it names a set of one. The whole-enum
    // form already worked. The member form fell through to the default arm
    // and was reported as a non-string parameter.
    expect(doc.channels?.OrderChannel.parameters).toEqual({ region: { enum: ["eu"] } });
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.channels?.OrderChannel.parameters).toEqual({ region: { enum: ["eu", "us"] } });
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // The built-in check is by namespace, not by name. A scalar the author
    // declared and happened to call `string` is not the built-in one, and it
    // carries no promise of being a string at all.
    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/non-string-channel-param");
    expect(doc.channels?.OrderChannel.parameters).toEqual({ region: {} });
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

    buildAsyncAPIDocument(runner.program, undefined, {});

    // The two declarations name the same set, so a comparison that sorted
    // first would call them equal. They are not: the order is the order the
    // emitted `enum` array carries, and only one of the two can be emitted.
    const reported = diagnostics.filter((d) => d.code === "tsp-asyncapi/conflicting-channel-param");
    expect(reported).toHaveLength(1);
    expect(reported[0].message).toContain("type");
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // The operation declares the three in the opposite order to the address.
    // The address decides the emitted order, so this input fails if the map
    // is ever built from the declarations instead.
    expect(Object.keys(doc.channels?.OrderChannel.parameters ?? {})).toEqual([
      "region",
      "tenant",
      "orderId",
    ]);
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // A model is neither a string, a scalar, an enum nor a union, so it
    // reaches the last arm of the value reader. Nothing else in this suite
    // gets there.
    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/non-string-channel-param");
    expect(doc.channels?.OrderChannel.parameters).toEqual({ region: {} });
  });
});
