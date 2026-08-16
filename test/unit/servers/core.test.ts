/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect } from "vitest";
import { expectDiagnosticEmpty, expectDiagnostics, t } from "@typespec/compiler/testing";
import { AsyncAPITester } from "../../../src/testing/index.js";
import { buildServersFrom } from "../../utils/servers.js";
import { namespaceOf } from "../../utils/namespace.js";
import { getServers } from "../../../src/decorators/index.js";
import { emitAsyncAPI, emitAsyncAPIWithDiagnostics } from "../../utils/test-host.js";
import { byCodePoint } from "../../utils/sort.js";
import { bySourcePosition, isSameApplication } from "../../../src/source-order.js";

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

    expect(Object.keys(doc.servers).sort(byCodePoint)).toEqual(["production", "sit"]);
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

  it("emits each optional field on its own, without the other four", async () => {
    // The decorator copies the five optional fields in a loop. The builder
    // then writes each one behind its own guard. The two tests above pass
    // all five fields, then none of them. Neither shape can tell the five
    // guards apart. A server that carries exactly one field pins each guard
    // on its own. It proves that no field leaks in from a neighbour, and
    // that no field is dropped when its neighbours are absent.
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @server("version-only", #{
        host: "a.example.com", protocol: "kafka", protocolVersion: "3.5.0"
      })
      @server("pathname-only", #{
        host: "b.example.com", protocol: "kafka", pathname: "/orders"
      })
      @server("title-only", #{
        host: "c.example.com", protocol: "kafka", title: "Title only"
      })
      @server("summary-only", #{
        host: "d.example.com", protocol: "kafka", summary: "Summary only"
      })
      @server("description-only", #{
        host: "e.example.com", protocol: "kafka", description: "Description only"
      })
      namespace Test;
    `);

    expect(doc.servers["version-only"]).toEqual({
      host: "a.example.com",
      protocol: "kafka",
      protocolVersion: "3.5.0",
    });
    expect(doc.servers["pathname-only"]).toEqual({
      host: "b.example.com",
      protocol: "kafka",
      pathname: "/orders",
    });
    expect(doc.servers["title-only"]).toEqual({
      host: "c.example.com",
      protocol: "kafka",
      title: "Title only",
    });
    expect(doc.servers["summary-only"]).toEqual({
      host: "d.example.com",
      protocol: "kafka",
      summary: "Summary only",
    });
    expect(doc.servers["description-only"]).toEqual({
      host: "e.example.com",
      protocol: "kafka",
      description: "Description only",
    });
    await expect(doc).toBeValidAsyncAPI();
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
    const servers = buildServersFrom(runner.program, Test) ?? {};
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
        code: "tsp-asyncapi/duplicate-server-name",
        severity: "error",
        message: /Duplicate server name: 'broker'/,
      },
    ]);
    expect(buildServersFrom(runner.program, Test)).toEqual({
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
        code: "tsp-asyncapi/duplicate-server-name",
        severity: "error",
        message: /Duplicate server name: 'broker'/,
      },
    ]);
    expect(buildServersFrom(runner.program, Test)).toEqual({
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
        code: "tsp-asyncapi/duplicate-server-name",
        severity: "error",
        message: /Duplicate server name: 'dup'/,
      },
      {
        code: "tsp-asyncapi/duplicate-server-name",
        severity: "error",
        message: /Duplicate server name: 'dup'/,
      },
    ]);
    expect(buildServersFrom(runner.program, Test)).toEqual({
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
        code: "tsp-asyncapi/duplicate-server-name",
        severity: "error",
        message: /Duplicate server name: 'broker'/,
      },
    ]);
    expect(buildServersFrom(runner.program, Test)).toEqual({
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
        code: "tsp-asyncapi/empty-server-field",
        severity: "error",
        message: /Empty server field: 'host'/,
      },
    ]);
    expect(Object.keys(buildServersFrom(runner.program, Test) ?? {})).toEqual(["sit"]);
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
        code: "tsp-asyncapi/empty-server-field",
        severity: "error",
        message: /Empty server field: 'protocol'/,
      },
    ]);
    expect(buildServersFrom(runner.program, Test)).toBeUndefined();
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
        code: "tsp-asyncapi/server-outside-service",
        severity: "warning",
        message: /Server 'nested' on namespace '[\w.]*Test\.Sub' was dropped/,
      },
    ]);
    // The diagnostic is a warning, so the document is still written. The
    // check below would pass on a missing document as well, which is why the
    // document itself is checked first.
    expect(doc).not.toBeNull();
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
        code: "tsp-asyncapi/server-outside-service",
        severity: "warning",
        message: /Server 'lonely' on namespace 'Test' was dropped/,
      },
    ]);
    expect(doc).not.toBeNull();
    expect(doc).not.toHaveProperty("servers");
  });

  it("writes no document at all when a server problem is reported as an error", async () => {
    // The severity of each diagnostic decides what the author ends up with.
    // An error stops the compiler before the emitter runs, so no file is
    // written. Every test that asserts against the builder rather than
    // against a document depends on that, and this is the one place the
    // suite states it.
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
      @service(#{ title: "Orders" })
      @server("blank", #{ host: "kafka.example.com", protocol: "  " })
      namespace Test;
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/empty-server-field",
        severity: "error",
        message: /Empty server field: 'protocol'/,
      },
    ]);
    expect(doc).toBeNull();
  });

  it("orders the servers of two files by the order the files are imported", async () => {
    // Source position orders the servers, and two applications in different
    // files compare by the rank of their file. The rank comes from
    // `program.sourceFiles`, whose insertion order is the order the compiler
    // reached each file. So `second.tsp`, imported first, ranks first, even
    // though its path sorts last. Ranking by path instead would put `alpha`
    // first and would disagree with the rest of the emitter.
    const doc = await emitAsyncAPI({
      "second.tsp": `
        using AsyncAPI;
        @@server(Test, "bravo", #{ host: "bravo.example.com", protocol: "kafka" });
      `,
      "first.tsp": `
        using AsyncAPI;
        @@server(Test, "alpha", #{ host: "alpha.example.com", protocol: "kafka" });
      `,
      "main.tsp": `
        @service(#{ title: "Orders" })
        namespace Test;
      `,
    });

    expect(Object.keys(doc.servers)).toEqual(["bravo", "alpha"]);
  });

  it("keeps the server of the file imported first when two files share a name", async () => {
    // The file imported first ranks first, so its application is the earlier
    // one and it is the one kept. `second.tsp` is imported first here, so its
    // server survives even though `first.tsp` sorts earlier by path.
    const runner = await AsyncAPITester.import("./second.tsp", "./first.tsp").createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose({
      "second.tsp": `
        using AsyncAPI;
        @@server(Test, "broker", #{ host: "second.example.com", protocol: "kafka" });
      `,
      "first.tsp": `
        using AsyncAPI;
        @@server(Test, "broker", #{ host: "first.example.com", protocol: "kafka" });
      `,
      "main.tsp": `
        @service(#{ title: "Orders" })
        namespace Test;
      `,
    });

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/duplicate-server-name",
        severity: "error",
        message: /Duplicate server name: 'broker'/,
      },
    ]);
    // The clash is an error, so a real compilation writes no document. The
    // surviving server is read from the state instead.
    expect(buildServersFrom(runner.program, namespaceOf(runner.program, "Test"))).toEqual({
      broker: { host: "second.example.com", protocol: "kafka" },
    });
  });

  it("applies one augment decorator once when its namespace is opened in two files", async () => {
    // This is the real shape of the case the reopened-namespace test covers
    // with two blocks in one file. The augment decorator runs once per
    // declaration of its target, and the two runs share a file and an
    // offset, so they are one application.
    const doc = await emitAsyncAPI({
      "main.tsp": `
        @service(#{ title: "Orders" })
        namespace Test;

        @@server(Test, "only", #{ host: "a.example.com", protocol: "kafka" });
      `,
      "first.tsp": `
        namespace Test {}
      `,
      "second.tsp": `
        namespace Test {}
      `,
    });

    expect(doc.servers).toEqual({
      only: { host: "a.example.com", protocol: "kafka" },
    });
  });

  it("reports the stray servers of two namespaces in source order", async () => {
    // The stray servers are collected by walking the state map, which is in
    // decorator evaluation order, and then sorted by source position. The
    // evaluation follows the order the namespaces are declared in, and the
    // two augment decorators below are written the other way round. So the
    // sort is what decides the order the author reads.
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
      @@server(Alpha, "alpha-broker", #{ host: "alpha.example.com", protocol: "kafka" });
      @@server(Beta, "beta-broker", #{ host: "beta.example.com", protocol: "kafka" });

      namespace Beta {}
      namespace Alpha {}

      @service(#{ title: "Orders" })
      namespace Test {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/server-outside-service",
        severity: "warning",
        message: /Server 'alpha-broker' on namespace 'Alpha' was dropped/,
      },
      {
        code: "tsp-asyncapi/server-outside-service",
        severity: "warning",
        message: /Server 'beta-broker' on namespace 'Beta' was dropped/,
      },
    ]);
    expect(doc).not.toBeNull();
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
        code: "tsp-asyncapi/invalid-server-name",
        severity: "error",
        message: /Invalid server name: 'prod.kafka'/,
      },
    ]);
    expect(Object.keys(buildServersFrom(runner.program, Test) ?? {})).toEqual(["sit"]);
  });
});

describe("Unit: source order keys", () => {
  it("ranks a path the program never loaded before every loaded file", async () => {
    // `fileRanking` reads `program.sourceFiles`, and a path the map does not
    // hold falls back to rank -1. A compiled program only ever hands this
    // comparator paths that its own map holds, so the fallback needs a
    // position built by hand. The fallback keeps the sort total, which is
    // what stops `Array.prototype.sort` from returning `NaN` order.
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;
    `);

    expectDiagnosticEmpty(diagnostics);
    const loaded = [...runner.program.sourceFiles.keys()][0];
    const compare = bySourcePosition(runner.program);

    expect(compare({ file: "never-loaded.tsp", pos: 0 }, { file: loaded, pos: 0 })).toBeLessThan(0);
    expect(compare({ file: loaded, pos: 0 }, { file: "never-loaded.tsp", pos: 0 })).toBeGreaterThan(
      0,
    );
  });

  it("treats two positions as the same application only when file and offset both match", () => {
    // The identity of an application is its source position. An augment
    // decorator runs once per declaration of its target, so the same
    // statement arrives twice with one position. Two statements never share
    // a file and an offset. The compiled cases above drive this through the
    // decorators, which run from the build output. The rule itself is
    // pinned here, on the source module the rest of the emitter imports.
    expect(isSameApplication({ file: "main.tsp", pos: 12 }, { file: "main.tsp", pos: 12 })).toBe(
      true,
    );
    // Same file, different offset: two statements written apart.
    expect(isSameApplication({ file: "main.tsp", pos: 12 }, { file: "main.tsp", pos: 40 })).toBe(
      false,
    );
    // Same offset, different file: the offset alone is not the identity,
    // because it only means something inside its own file.
    expect(isSameApplication({ file: "main.tsp", pos: 12 }, { file: "other.tsp", pos: 12 })).toBe(
      false,
    );
  });
});
