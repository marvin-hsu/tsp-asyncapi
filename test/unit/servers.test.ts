/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect } from "vitest";
import { expectDiagnosticEmpty, expectDiagnostics, t } from "@typespec/compiler/testing";
import { AsyncAPITester } from "../../src/testing/index.js";
import { buildServers } from "../../src/builders/servers.js";
import { getServers } from "../../src/decorators/index.js";
import { emitAsyncAPI, emitAsyncAPIWithDiagnostics } from "../utils/test-host.js";

describe("Unit: servers", () => {
  it("emits one entry per declared server with its fields", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "kafka.example.com:9092",
        protocol: "kafka",
        protocolVersion: "3.5.0",
        pathname: "/orders",
        title: "Production",
        summary: "Production broker",
        description: "The production Kafka cluster."
      })
      @server("sit", #{
        host: "kafka.sit.example.com:9092",
        protocol: "kafka",
        protocolVersion: "3.5.0"
      })
      namespace Test;
    `);

    expect(Object.keys(doc.servers).sort()).toEqual(["production", "sit"]);
    expect(doc.servers.production).toEqual({
      host: "kafka.example.com:9092",
      protocol: "kafka",
      protocolVersion: "3.5.0",
      pathname: "/orders",
      title: "Production",
      summary: "Production broker",
      description: "The production Kafka cluster.",
    });
    expect(doc.servers.sit).toEqual({
      host: "kafka.sit.example.com:9092",
      protocol: "kafka",
      protocolVersion: "3.5.0",
    });
  });

  it("omits the optional fields that were not given", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @server("minimal", #{ host: "mqtt.example.com", protocol: "mqtt" })
      namespace Test;
    `);

    expect(doc.servers.minimal).toEqual({
      host: "mqtt.example.com",
      protocol: "mqtt",
    });
  });

  it("omits the servers field entirely when no server is declared", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      namespace Test;
    `);

    expect(doc).not.toHaveProperty("servers");
  });

  it("emits the servers in the order they appear in the source", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @server("aaa", #{ host: "a.example.com", protocol: "kafka" })
      @server("bbb", #{ host: "b.example.com", protocol: "kafka" })
      @server("ccc", #{ host: "c.example.com", protocol: "kafka" })
      namespace Test;
    `);

    expect(Object.keys(doc.servers)).toEqual(["aaa", "bbb", "ccc"]);
  });

  it("emits the servers in source order when they come from augment decorators", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      namespace Test;

      @@server(Test, "aaa", #{ host: "a.example.com", protocol: "kafka" });
      @@server(Test, "bbb", #{ host: "b.example.com", protocol: "kafka" });
      @@server(Test, "ccc", #{ host: "c.example.com", protocol: "kafka" });
    `);

    expect(Object.keys(doc.servers)).toEqual(["aaa", "bbb", "ccc"]);
  });

  it("applies one augment decorator once when its namespace is reopened", async () => {
    // An augment decorator runs once per declaration of its target
    // namespace. A reopened namespace therefore runs the same `@@server`
    // again, which used to look like a duplicate name and dropped the whole
    // document.
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      namespace Test {}
      namespace Test {}

      @@server(Test, "only", #{ host: "a.example.com", protocol: "kafka" });
    `);

    expect(doc.servers).toEqual({
      only: { host: "a.example.com", protocol: "kafka" },
    });
  });

  it("keeps source order when stacked and augment decorators are mixed", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @server("inline1", #{ host: "one.example.com", protocol: "kafka" })
      @server("inline2", #{ host: "two.example.com", protocol: "kafka" })
      namespace Test;

      @@server(Test, "aug1", #{ host: "three.example.com", protocol: "kafka" });
    `);

    expect(Object.keys(doc.servers)).toEqual(["inline1", "inline2", "aug1"]);
  });

  it("keeps a server named __proto__ as a real entry", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @server("__proto__", #{ host: "proto.example.com", protocol: "kafka" })
      @server("ok", #{ host: "ok.example.com", protocol: "kafka" })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnosticEmpty(diagnostics);
    const servers = buildServers(runner.program, Test) ?? {};
    expect(Object.keys(servers)).toEqual(["__proto__", "ok"]);
    expect(Object.getOwnPropertyDescriptor(servers, "__proto__")?.value).toEqual({
      host: "proto.example.com",
      protocol: "kafka",
    });
    expect(JSON.stringify(servers)).toContain('"__proto__":{"host":"proto.example.com"');
  });

  it("reports a diagnostic and keeps the first server in source order when two share a name", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @server("broker", #{ host: "first.example.com", protocol: "kafka" })
      @server("broker", #{ host: "second.example.com", protocol: "kafka" })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "typespec-asyncapi/duplicate-server-name",
        message: /Duplicate server name: 'broker'/,
      },
    ]);
    expect(buildServers(runner.program, Test)).toEqual({
      broker: { host: "first.example.com", protocol: "kafka" },
    });
  });

  it("keeps the surviving servers in source order after a name clash", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @server("broker", #{ host: "first.example.com", protocol: "kafka" })
      @server("other", #{ host: "other.example.com", protocol: "kafka" })
      @server("broker", #{ host: "second.example.com", protocol: "kafka" })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "typespec-asyncapi/duplicate-server-name",
        message: /Duplicate server name: 'broker'/,
      },
    ]);
    expect(buildServers(runner.program, Test)).toEqual({
      broker: { host: "first.example.com", protocol: "kafka" },
      other: { host: "other.example.com", protocol: "kafka" },
    });
  });

  it("keeps the first server in source order when three share a name", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @server("dup", #{ host: "one.example.com", protocol: "kafka" })
      @server("dup", #{ host: "two.example.com", protocol: "kafka" })
      @server("dup", #{ host: "three.example.com", protocol: "kafka" })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "typespec-asyncapi/duplicate-server-name",
        message: /Duplicate server name: 'dup'/,
      },
      {
        code: "typespec-asyncapi/duplicate-server-name",
        message: /Duplicate server name: 'dup'/,
      },
    ]);
    expect(buildServers(runner.program, Test)).toEqual({
      dup: { host: "one.example.com", protocol: "kafka" },
    });
  });

  it("keeps the stacked server when an augment decorator repeats its name", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @server("broker", #{ host: "stacked.example.com", protocol: "kafka" })
      namespace ${t.namespace("Test")} {}

      @@server(Test, "broker", #{ host: "augment.example.com", protocol: "kafka" });
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "typespec-asyncapi/duplicate-server-name",
        message: /Duplicate server name: 'broker'/,
      },
    ]);
    expect(buildServers(runner.program, Test)).toEqual({
      broker: { host: "stacked.example.com", protocol: "kafka" },
    });
  });

  it("reports a diagnostic and drops a server whose host is blank", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @server("blank", #{ host: "   ", protocol: "kafka" })
      @server("sit", #{ host: "kafka.sit.example.com", protocol: "kafka" })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "typespec-asyncapi/empty-server-field",
        message: /Empty server field: 'host'/,
      },
    ]);
    expect(Object.keys(buildServers(runner.program, Test) ?? {})).toEqual(["sit"]);
  });

  it("reports a diagnostic and drops a server whose protocol is blank", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @server("blank", #{ host: "kafka.example.com", protocol: "" })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "typespec-asyncapi/empty-server-field",
        message: /Empty server field: 'protocol'/,
      },
    ]);
    expect(buildServers(runner.program, Test)).toBeUndefined();
  });

  it("omits an optional field that holds only whitespace", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "kafka.example.com:9092",
        protocol: "kafka",
        protocolVersion: "",
        pathname: "",
        title: " ",
        summary: "",
        description: "   "
      })
      namespace Test;
    `);

    expect(doc.servers.production).toEqual({
      host: "kafka.example.com:9092",
      protocol: "kafka",
    });
  });

  it("trims the whitespace around a field value", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "  kafka.example.com:9092  ",
        protocol: " kafka ",
        summary: "  Production broker  "
      })
      namespace Test;
    `);

    expect(doc.servers.production).toEqual({
      host: "kafka.example.com:9092",
      protocol: "kafka",
      summary: "Production broker",
    });
  });

  it("keeps the recorded servers safe from a change to the returned list", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @server("production", #{ host: "kafka.example.com", protocol: "kafka" })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnosticEmpty(diagnostics);
    const first = getServers(runner.program, Test);
    first[0].host = "mutated.example.com";

    expect(getServers(runner.program, Test)[0].host).toBe("kafka.example.com");
  });

  it("reports a diagnostic and leaves out a server declared on a namespace other than the service", async () => {
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
      @service(#{ title: "Orders" })
      namespace Test;

      @server("nested", #{ host: "nested.example.com", protocol: "kafka" })
      namespace Test.Sub {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "typespec-asyncapi/server-outside-service",
        message: /Server 'nested' on namespace '[\w.]*Test\.Sub' was dropped/,
      },
    ]);
    expect(doc).not.toHaveProperty("servers");
  });

  it("reports a diagnostic for a server declared when no service exists", async () => {
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(
      `
      @server("lonely", #{ host: "lonely.example.com", protocol: "kafka" })
      namespace Test;
    `,
      {},
      false,
    );

    expectDiagnostics(diagnostics, [
      {
        code: "typespec-asyncapi/server-outside-service",
        message: /Server 'lonely' on namespace 'Test' was dropped/,
      },
    ]);
    expect(doc).not.toHaveProperty("servers");
  });

  it("reports a diagnostic and drops a server whose name has an illegal character", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @server("prod.kafka", #{ host: "kafka.example.com", protocol: "kafka" })
      @server("sit", #{ host: "kafka.sit.example.com", protocol: "kafka" })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "typespec-asyncapi/invalid-server-name",
        message: /Invalid server name: 'prod.kafka'/,
      },
    ]);
    expect(Object.keys(buildServers(runner.program, Test) ?? {})).toEqual(["sit"]);
  });
});
