/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { beforeEach, describe, expect, it } from "vitest";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "../../../src/testing/index.js";
import { buildAsyncAPIDocument } from "../../../src/pipeline.js";
import { findDiagnostic } from "../../utils/diagnostics.js";
import { emitAsyncAPI } from "../../utils/test-host.js";

describe("Unit: Operation security (Phase 5.6)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("emits the schemes of the operation and never those of the server", async () => {
    // AsyncAPI reads the two arrays together. A client satisfies the array of
    // the server and the array of the operation, so the server schemes are
    // not copied here.
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("kafka-scram", #{ type: "scramSha512" })
      @securityScheme("op-token", #{ type: "httpApiKey", name: "x-token", in: "header" })
      @useSecurity("kafka-scram")
      @server("production", #{ host: "kafka.example.com:9092", protocol: "kafka" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send
        @useSecurity("op-token")
        op publish(event: OrderCreated): void;
      }
    `);

    expect(doc.operations?.publish.security).toEqual([
      { $ref: "#/components/securitySchemes/op-token" },
    ]);
    expect(doc.servers?.production.security).toEqual([
      { $ref: "#/components/securitySchemes/kafka-scram" },
    ]);
  });

  it("emits every scheme the operation names, in source order", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      @securityScheme("first", #{ type: "plain" })
      @securityScheme("second", #{ type: "plain" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send
        @useSecurity("first")
        @useSecurity("second")
        op publish(event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.operations?.publish.security).toEqual([
      { $ref: "#/components/securitySchemes/first" },
      { $ref: "#/components/securitySchemes/second" },
    ]);
  });

  it("omits the security field when the operation names no scheme", async () => {
    // An empty array reads as "this operation needs no scheme at all", which
    // is a claim the author never made.
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send op publish(event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.operations?.publish).not.toHaveProperty("security");
  });

  it("reports a name that no securityScheme defines and drops the entry", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      @securityScheme("known", #{ type: "plain" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send
        @useSecurity("missing")
        @useSecurity("known")
        op publish(event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(
      findDiagnostic(diagnostics, "tsp-asyncapi/undeclared-security-scheme").message,
    ).toContain("'missing'");
    expect(doc.operations?.publish.security).toEqual([
      { $ref: "#/components/securitySchemes/known" },
    ]);
  });

  it("does not report an operation @useSecurity as one outside a server", async () => {
    // `use-security-outside-server` is about a namespace whose servers would
    // carry the scheme. An operation carries its own `security` array, so the
    // check has nothing to say about it.
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      @securityScheme("known", #{ type: "plain" })
      @server("production", #{ host: "kafka.example.com", protocol: "kafka" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send
        @useSecurity("known")
        op publish(event: OrderCreated): void;
      }
    `);

    buildAsyncAPIDocument(runner.program, undefined, {});

    expect(
      diagnostics.some((entry) => entry.code === "tsp-asyncapi/use-security-outside-server"),
    ).toBe(false);
  });
});
