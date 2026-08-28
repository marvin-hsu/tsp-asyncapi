import { describe, it, expect } from "vitest";
import { expectDiagnostics, t } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing.js";
import { builtSecuritySchemes } from "../../../../utils/security-schemes.js";
import { reportSecurityUsesWithoutServer } from "#core/resolve/servers.js";
import { getUsedSecuritySchemes } from "#core/decorators/index.js";
import { buildServersFrom } from "../../../../utils/servers.js";
import { emitDocument, emitDocumentWithDiagnostics } from "../../../../utils/test-host.js";
import { serversOf } from "../../../../utils/document.js";
import { diagnosticsWith } from "../../../../utils/diagnostics.js";

describe("Unit: server security", () => {
  it("emits one reference per required scheme, in source order", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @securityScheme("scram", #{ type: "scramSha512" })
      @securityScheme("oidc", #{
        type: "openIdConnect",
        openIdConnectUrl: "https://example.com/.well-known/openid-configuration"
      })
      @useSecurity("scram")
      @useSecurity("oidc")
      @server("production", #{ host: "kafka.example.com", protocol: "kafka" })
      namespace Test;
    `);

    expect(serversOf(doc).production.security).toEqual([
      { $ref: "#/components/securitySchemes/scram" },
      { $ref: "#/components/securitySchemes/oidc" },
    ]);
  });

  it("puts the same security on every server of the namespace", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @securityScheme("scram", #{ type: "scramSha512" })
      @useSecurity("scram")
      @server("production", #{ host: "prod.example.com", protocol: "kafka" })
      @server("sit", #{ host: "sit.example.com", protocol: "kafka" })
      namespace Test;
    `);

    expect(serversOf(doc).production.security).toEqual([
      { $ref: "#/components/securitySchemes/scram" },
    ]);
    expect(serversOf(doc).sit.security).toEqual([{ $ref: "#/components/securitySchemes/scram" }]);
  });

  it("omits the security field when the namespace requires no scheme", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("production", #{ host: "kafka.example.com", protocol: "kafka" })
      namespace Test;
    `);

    expect(serversOf(doc).production).not.toHaveProperty("security");
  });

  it("emits one reference for a scheme name given twice", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @securityScheme("scram", #{ type: "scramSha512" })
      @useSecurity("scram")
      @useSecurity("scram")
      @server("production", #{ host: "kafka.example.com", protocol: "kafka" })
      namespace Test;
    `);

    expect(serversOf(doc).production.security).toEqual([
      { $ref: "#/components/securitySchemes/scram" },
    ]);
  });

  it("reports a scheme that no securityScheme defines and drops the entry", async () => {
    // The reference would address a key the document does not carry, and the
    // official parser rejects the whole document for it. So the entry is
    // dropped, and the only entry left is the one that resolves.
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      @securityScheme("scram", #{ type: "scramSha512" })
      @useSecurity("missing")
      @useSecurity("scram")
      @server("production", #{ host: "kafka.example.com", protocol: "kafka" })
      namespace Test;
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/undeclared-security-scheme",
        severity: "warning",
        message:
          /@useSecurity\('missing'\) names a security scheme that no @securityScheme defines/,
      },
    ]);
    expect(serversOf(doc).production.security).toEqual([
      { $ref: "#/components/securitySchemes/scram" },
    ]);
    await expect(doc).toBeValidAsyncAPI();
  });

  it("omits the security field when no required scheme is defined", async () => {
    // An empty `security` array is not the same as a missing one. AsyncAPI
    // reads an empty array as "this server needs no scheme at all", which is
    // a claim the author never made.
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      @useSecurity("missing")
      @server("production", #{ host: "kafka.example.com", protocol: "kafka" })
      namespace Test;
    `);

    expectDiagnostics(diagnostics, [
      { code: "tsp-asyncapi/undeclared-security-scheme", severity: "warning" },
    ]);
    expect(serversOf(doc).production).not.toHaveProperty("security");
    await expect(doc).toBeValidAsyncAPI();
  });

  it("applies one augment decorator once when its namespace is reopened", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @securityScheme("scram", #{ type: "scramSha512" })
      @server("production", #{ host: "kafka.example.com", protocol: "kafka" })
      namespace Test {}
      namespace Test {}

      @@useSecurity(Test, "scram");
    `);

    expect(serversOf(doc).production.security).toEqual([
      { $ref: "#/components/securitySchemes/scram" },
    ]);
  });

  it("reads back the required scheme names in source order", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @useSecurity("scram")
      @useSecurity("oidc")
      @server("production", #{ host: "kafka.example.com", protocol: "kafka" })
      namespace ${t.namespace("Test")} {}
    `);

    expect(diagnostics).toEqual([]);
    expect(getUsedSecuritySchemes(runner.program, Test)).toEqual(["scram", "oidc"]);
  });

  it("reports a useSecurity on a namespace that declares no server", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      namespace Test;

      @useSecurity("scram")
      namespace Test.Sub {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/use-security-outside-server",
        severity: "warning",
        message: /@useSecurity\('scram'\) on namespace '[\w.]*Test\.Sub' was dropped/,
      },
    ]);
    // The diagnostic is a warning, so the document is still written. The
    // check below would pass on a missing document as well, which is why the
    // document itself is checked first.
    expect(doc).not.toBeNull();
    expect(doc).not.toHaveProperty("servers");
  });

  it("reports a scheme name with an illegal character and drops the application", async () => {
    // The name goes into a JSON Pointer, and no `@securityScheme` could
    // define such a name either. So the reference could never resolve.
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @securityScheme("scram", #{ type: "scramSha512" })
      @useSecurity("a/b#x")
      @useSecurity("   ")
      @useSecurity("scram")
      @server("production", #{ host: "kafka.example.com", protocol: "kafka" })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/invalid-security-scheme-name",
        severity: "error",
        message: /Invalid security scheme name: ' {3}'/,
      },
      {
        code: "tsp-asyncapi/invalid-security-scheme-name",
        severity: "error",
        message: /Invalid security scheme name: 'a\/b#x'/,
      },
    ]);
    expect(getUsedSecuritySchemes(runner.program, Test)).toEqual(["scram"]);
    expect(buildServersFrom(runner.program, Test)?.production.security).toEqual([
      { $ref: "#/components/securitySchemes/scram" },
    ]);
  });

  it("rejects a padded name on both decorators, so neither can reach the other", async () => {
    // `@securityScheme` uses the name as the key, so it never trims one.
    // `@useSecurity` writes the same name into a pointer at that key. If
    // only one of the two trimmed, a padded name would mean two different
    // things, and no author could make the two agree.
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @securityScheme(" sc ", #{ type: "plain" })
      @useSecurity(" sc ")
      @server("production", #{ host: "kafka.example.com", protocol: "kafka" })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/invalid-security-scheme-name",
        severity: "error",
        message: /Invalid security scheme name: ' sc '/,
      },
      {
        code: "tsp-asyncapi/invalid-security-scheme-name",
        severity: "error",
        message: /Invalid security scheme name: ' sc '/,
      },
    ]);
    // Both applications are dropped, so neither the key nor the reference
    // reaches the document.
    expect(builtSecuritySchemes(runner.program)).toBeUndefined();
    expect(getUsedSecuritySchemes(runner.program, Test)).toEqual([]);
  });

  it("reports a useSecurity next to a server outside the service", async () => {
    // Both applications are dropped, and each is a separate mistake the
    // author wrote, so each gets its own diagnostic.
    //
    // A server dropped for sitting outside the service still reaches the
    // state, unlike one dropped by its own field check. The emitter reports
    // this case for the same reason: it asks whether the namespace puts any
    // server into the document, not why a server was dropped.
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      namespace Test;

      @useSecurity("scram")
      @server("nested", #{ host: "nested.example.com", protocol: "kafka" })
      namespace Test.Sub {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/server-outside-service",
        severity: "warning",
        message: /Server 'nested' on namespace '[\w.]*Test\.Sub' was dropped/,
      },
      {
        code: "tsp-asyncapi/use-security-outside-server",
        severity: "warning",
        message: /@useSecurity\('scram'\)/,
      },
    ]);
    expect(doc).not.toBeNull();
    expect(doc).not.toHaveProperty("servers");
  });

  it("reports the stray useSecurity applications of two namespaces in source order", async () => {
    // The stray applications are collected by walking the state map, which
    // is in decorator evaluation order, and then sorted by source position.
    // The evaluation follows the order the namespaces are declared in, and
    // the two augment decorators below are written the other way round. So
    // the sort is what decides the order the author reads.
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @@useSecurity(Alpha, "alpha-scheme");
      @@useSecurity(Beta, "beta-scheme");

      namespace Beta {}
      namespace Alpha {}

      @service(#{ title: "Orders" })
      namespace Test {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/use-security-outside-server",
        severity: "warning",
        message: /@useSecurity\('alpha-scheme'\) on namespace 'Alpha' was dropped/,
      },
      {
        code: "tsp-asyncapi/use-security-outside-server",
        severity: "warning",
        message: /@useSecurity\('beta-scheme'\) on namespace 'Beta' was dropped/,
      },
    ]);
    expect(doc).not.toBeNull();
    expect(doc).not.toHaveProperty("servers");
  });

  it("reports a useSecurity whose only server was dropped by its own check", async () => {
    // A dropped server never reaches the state, so the namespace reads as
    // one that declares no server. The author then learns about both halves
    // of the mistake.
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @useSecurity("scram")
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

    // The dropped server is reported as an error, so a real compilation
    // stops before the emitter runs. The check is called directly here to
    // show what the emitter would report. `Test` is the service namespace,
    // and it is passed because the check asks whether that namespace puts a
    // server into the document.
    reportSecurityUsesWithoutServer(runner.program, Test);
    const stray = diagnosticsWith(runner.program.diagnostics, "use-security-outside-server");
    expect(stray).toHaveLength(1);
    expect(stray[0].message).toMatch(
      /@useSecurity\('scram'\) on namespace '[\w.]*Test' was dropped/,
    );
  });
});
