/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect } from "vitest";
import { expectDiagnostics, t } from "@typespec/compiler/testing";
import { AsyncAPITester } from "../../../../src/testing/index.js";
import { buildServersFrom } from "../../../utils/servers.js";
import { emitAsyncAPI, emitAsyncAPIWithDiagnostics } from "../../../utils/test-host.js";

describe("Unit: server external docs", () => {
  it("copies the external docs of the namespace onto every server", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @externalDocs("https://example.com/brokers", "How to reach the brokers")
      @server("production", #{ host: "prod.example.com", protocol: "kafka" })
      @server("sit", #{ host: "sit.example.com", protocol: "kafka" })
      namespace Test;
    `);

    const expected = {
      url: "https://example.com/brokers",
      description: "How to reach the brokers",
    };
    expect(doc.servers.production.externalDocs).toEqual(expected);
    expect(doc.servers.sit.externalDocs).toEqual(expected);
    // The same namespace feeds `info`, so the link appears there as well.
    // AsyncAPI defines the field on both objects, and a reader of a server
    // should not have to look at `info` to find it.
    expect(doc.info.externalDocs).toEqual(expected);
  });

  it("omits the external docs of a server when the namespace carries none", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @server("production", #{ host: "prod.example.com", protocol: "kafka" })
      namespace Test;
    `);

    expect(doc.servers.production).not.toHaveProperty("externalDocs");
  });

  it("reports an external docs url that is not an absolute url", async () => {
    // The link is copied onto every server, so a relative one would make the
    // official parser reject the document at each of them. The diagnostic is
    // an error, so no document is written at all.
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
      @service(#{ title: "Orders" })
      @externalDocs("/brokers")
      @server("production", #{ host: "prod.example.com", protocol: "kafka" })
      namespace Test;
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/invalid-url",
        severity: "error",
        message: /The 'url' value '\/brokers' is not an absolute URL/,
      },
    ]);
    expect(doc).toBeNull();
  });

  it("gives each server its own copy of the shared fields", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @externalDocs("https://example.com/brokers")
      @securityScheme("scram", #{ type: "scramSha512" })
      @useSecurity("scram")
      @server("production", #{ host: "prod.example.com", protocol: "kafka" })
      @server("sit", #{ host: "sit.example.com", protocol: "kafka" })
      namespace ${t.namespace("Test")} {}
    `);

    expect(diagnostics).toEqual([]);
    const servers = buildServersFrom(runner.program, Test) ?? {};
    expect(servers.production.externalDocs).not.toBe(servers.sit.externalDocs);
    expect(servers.production.security?.[0]).not.toBe(servers.sit.security?.[0]);
  });

  it("emits the oauth2 flows in a fixed order, whatever order they are written in", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        flows: #{
          authorizationCode: #{
            authorizationUrl: "https://example.com/auth",
            tokenUrl: "https://example.com/token",
            availableScopes: #{ read: "Read" },
          },
          clientCredentials: #{
            tokenUrl: "https://example.com/token",
            availableScopes: #{ read: "Read" },
          },
          password: #{
            tokenUrl: "https://example.com/token",
            availableScopes: #{ read: "Read" },
          },
          implicit: #{
            authorizationUrl: "https://example.com/auth",
            availableScopes: #{ read: "Read" },
          },
        },
      })
      namespace Test;
    `);

    // The flows are written here in the reverse of the emitted order. An
    // assertion with `toEqual` ignores key order, so only this check can tell
    // that the emitter imposes one rather than following the author.
    expect(Object.keys(doc.components.securitySchemes.oauth.flows)).toEqual([
      "implicit",
      "password",
      "clientCredentials",
      "authorizationCode",
    ]);
  });

  it("keeps an availableScopes key exactly as it was written", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        flows: #{
          clientCredentials: #{
            tokenUrl: "https://example.com/token",
            availableScopes: #{ \` orders:read \`: "  Read orders.  " },
          },
        },
      })
      namespace Test;
    `);

    // The value is trimmed and the key is not. The key pairs an entry with
    // the `scopes` list of a usage site, so trimming it would break that
    // pairing. Only the value half of this rule was covered before.
    const flow = doc.components.securitySchemes.oauth.flows.clientCredentials;
    expect(Object.keys(flow.availableScopes)).toEqual([" orders:read "]);
    expect(flow.availableScopes[" orders:read "]).toBe("Read orders.");
  });

  it("drops a scheme whose required field is blank, whatever its type", async () => {
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
      @service(#{ title: "Orders" })
      @securityScheme("h", #{ type: "http", scheme: "   " })
      @securityScheme("o", #{ type: "openIdConnect", openIdConnectUrl: "   " })
      @securityScheme("k", #{ type: "httpApiKey", name: "  ", in: "header" })
      namespace Test;
    `);

    // Each type has a required string of its own, and a blank one names
    // nothing. The scheme is dropped rather than emitted with an empty value,
    // and the author gets one report per scheme.
    expect(diagnostics.map((d) => d.code)).toEqual([
      "tsp-asyncapi/empty-security-scheme-field",
      "tsp-asyncapi/empty-security-scheme-field",
      "tsp-asyncapi/empty-security-scheme-field",
    ]);
    // Nothing survives, so the section is left out rather than emitted empty.
    // These were the only components in the document, so `components` itself
    // is omitted too.
    expect(doc?.components?.securitySchemes).toBeUndefined();
  });

  it("leaves out every optional field the author did not give", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("bearer", #{ type: "http", scheme: "bearer" })
      @securityScheme("oidc", #{
        type: "openIdConnect",
        openIdConnectUrl: "https://example.com/.well-known/openid-configuration"
      })
      @securityScheme("oauth", #{
        type: "oauth2",
        flows: #{
          clientCredentials: #{
            tokenUrl: "https://example.com/token",
            availableScopes: #{ read: "Read" }
          }
        }
      })
      namespace Test;
    `);

    const schemes = doc.components.securitySchemes;

    // Every optional field is absent rather than present and empty. A reader
    // cannot tell a deliberate blank from an oversight, so the emitter never
    // writes one.
    expect(schemes.bearer).not.toHaveProperty("bearerFormat");
    expect(schemes.bearer).not.toHaveProperty("description");
    expect(schemes.oidc).not.toHaveProperty("scopes");
    expect(schemes.oidc).not.toHaveProperty("description");
    expect(schemes.oauth).not.toHaveProperty("scopes");
    // `refreshUrl` is the one URL every flow allows and none requires.
    expect(schemes.oauth.flows.clientCredentials).not.toHaveProperty("refreshUrl");
  });

  it("reports a flow url that is not absolute and drops the flow", async () => {
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        flows: #{
          clientCredentials: #{
            tokenUrl: "/token",
            availableScopes: #{ read: "Read" }
          }
        }
      })
      namespace Test;
    `);

    // AsyncAPI requires an absolute URL. A relative one makes the official
    // parser reject the whole document, so the flow cannot be emitted.
    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/invalid-url");
    expect(doc?.components?.securitySchemes?.oauth?.flows ?? {}).not.toHaveProperty(
      "clientCredentials",
    );
  });

  it("reports a missing flow url", async () => {
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        flows: #{
          clientCredentials: #{
            tokenUrl: "   ",
            availableScopes: #{ read: "Read" }
          }
        }
      })
      namespace Test;
    `);

    // A blank URL is treated as a missing one, so the author gets the
    // missing-url message rather than two reports for one mistake.
    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/missing-oauth-flow-url");
  });

  it("reports a useSecurity when the program declares no service at all", async () => {
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
      @useSecurity("scram")
      @server("nested", #{ host: "nested.example.com", protocol: "kafka" })
      namespace Test {}
    `);

    // With no service there is no namespace whose servers reach a document,
    // so every application is stray. This is the branch where the check has
    // no service namespace to compare against.
    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/use-security-outside-server");
  });

  it("reports an undeclared scheme once, however many servers the namespace has", async () => {
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
      @service(#{ title: "Orders" })
      @useSecurity("missing")
      @server("production", #{ host: "prod.example.com", protocol: "kafka" })
      @server("sit", #{ host: "sit.example.com", protocol: "kafka" })
      namespace Test;
    `);

    // The security list is resolved once for the namespace and copied onto
    // every server. A regression that resolved it inside the per-server loop
    // would report once per server, and a single-server test could not see it.
    const reported = diagnostics.filter(
      (d) => d.code === "tsp-asyncapi/undeclared-security-scheme",
    );
    expect(reported).toHaveLength(1);
    expect(Object.keys(doc.servers)).toEqual(["production", "sit"]);
  });
});
