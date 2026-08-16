/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect } from "vitest";
import { expectDiagnosticEmpty, expectDiagnostics, t } from "@typespec/compiler/testing";
import { AsyncAPITester } from "../../../../src/testing/index.js";
import { buildSecuritySchemes } from "../../../../src/builders/security-schemes.js";
import { getSecuritySchemes } from "../../../../src/decorators/index.js";
import { emitAsyncAPI, emitAsyncAPIWithDiagnostics } from "../../../utils/test-host.js";

describe("Unit: security schemes", () => {
  it("emits the eight schemes that carry only a type", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("userPassword", #{ type: "userPassword" })
      @securityScheme("x509", #{ type: "X509" })
      @securityScheme("symmetric", #{ type: "symmetricEncryption" })
      @securityScheme("asymmetric", #{ type: "asymmetricEncryption" })
      @securityScheme("plain", #{ type: "plain" })
      @securityScheme("scram256", #{ type: "scramSha256" })
      @securityScheme("scram512", #{ type: "scramSha512", description: "SCRAM SHA-512." })
      @securityScheme("gssapi", #{ type: "gssapi" })
      namespace Test;
    `);

    expect(doc.components.securitySchemes).toEqual({
      userPassword: { type: "userPassword" },
      // The specification spells this one with a capital X. The emitter
      // writes every type value exactly as the specification does.
      x509: { type: "X509" },
      symmetric: { type: "symmetricEncryption" },
      asymmetric: { type: "asymmetricEncryption" },
      plain: { type: "plain" },
      scram256: { type: "scramSha256" },
      scram512: { type: "scramSha512", description: "SCRAM SHA-512." },
      gssapi: { type: "gssapi" },
    });
  });

  it("emits an apiKey scheme with a user or password location and no name", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("byUser", #{ type: "apiKey", in: "user" })
      @securityScheme("byPassword", #{ type: "apiKey", in: "password" })
      namespace Test;
    `);

    expect(doc.components.securitySchemes).toEqual({
      byUser: { type: "apiKey", in: "user" },
      byPassword: { type: "apiKey", in: "password" },
    });
  });

  it("emits an httpApiKey scheme with its name and location", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("hdr", #{ type: "httpApiKey", name: "X-Api-Key", in: "header" })
      @securityScheme("qry", #{ type: "httpApiKey", name: "api_key", in: "query" })
      @securityScheme("cke", #{ type: "httpApiKey", name: "sid", in: "cookie" })
      namespace Test;
    `);

    expect(doc.components.securitySchemes).toEqual({
      hdr: { type: "httpApiKey", name: "X-Api-Key", in: "header" },
      qry: { type: "httpApiKey", name: "api_key", in: "query" },
      cke: { type: "httpApiKey", name: "sid", in: "cookie" },
    });
  });

  it("emits an http scheme with its bearer format", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("bearer", #{ type: "http", scheme: "bearer", bearerFormat: "JWT" })
      @securityScheme("basic", #{ type: "http", scheme: "basic" })
      namespace Test;
    `);

    expect(doc.components.securitySchemes).toEqual({
      bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      basic: { type: "http", scheme: "basic" },
    });
  });

  it("rejects a bearer format on a scheme that is not bearer", async () => {
    // AsyncAPI describes the bearer scheme with an object of its own, and
    // that object is the only one carrying `bearerFormat`. The library
    // declares the same split, so the type checker answers this one.
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @securityScheme("basic", #{ type: "http", scheme: "basic", bearerFormat: "JWT" })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [{ code: "invalid-argument" }]);
    expect(buildSecuritySchemes(runner.program)).toBeUndefined();
  });

  it("emits a scheme description and drops a blank bearer format", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("bearer", #{
        type: "http",
        scheme: "bearer",
        bearerFormat: "   ",
        description: "  A bearer token.  "
      })
      @securityScheme("basic", #{ type: "http", scheme: "basic", description: "   " })
      namespace Test;
    `);

    expect(doc.components.securitySchemes).toEqual({
      bearer: { type: "http", scheme: "bearer", description: "A bearer token." },
      basic: { type: "http", scheme: "basic" },
    });
  });

  it("emits an openIdConnect scheme with its url and scopes", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("oidc", #{
        type: "openIdConnect",
        openIdConnectUrl: "https://example.com/.well-known/openid-configuration",
        scopes: #["orders:read"]
      })
      namespace Test;
    `);

    expect(doc.components.securitySchemes.oidc).toEqual({
      type: "openIdConnect",
      openIdConnectUrl: "https://example.com/.well-known/openid-configuration",
      scopes: ["orders:read"],
    });
  });

  it("emits the whole flows structure of an oauth2 scheme", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        description: "The identity provider.",
        scopes: #["orders:write"],
        flows: #{
          implicit: #{
            authorizationUrl: "https://example.com/authorize",
            availableScopes: #{ \`orders:read\`: "Read orders" }
          },
          password: #{
            tokenUrl: "https://example.com/token",
            availableScopes: #{ \`orders:read\`: "Read orders" }
          },
          clientCredentials: #{
            tokenUrl: "https://example.com/token",
            refreshUrl: "https://example.com/refresh",
            availableScopes: #{ \`orders:write\`: "Write orders" }
          },
          authorizationCode: #{
            authorizationUrl: "https://example.com/authorize",
            tokenUrl: "https://example.com/token",
            refreshUrl: "https://example.com/refresh",
            availableScopes: #{ \`orders:read\`: "Read orders", \`orders:write\`: "Write orders" }
          }
        }
      })
      namespace Test;
    `);

    expect(doc.components.securitySchemes.oauth).toEqual({
      type: "oauth2",
      description: "The identity provider.",
      flows: {
        implicit: {
          authorizationUrl: "https://example.com/authorize",
          availableScopes: { "orders:read": "Read orders" },
        },
        password: {
          tokenUrl: "https://example.com/token",
          availableScopes: { "orders:read": "Read orders" },
        },
        clientCredentials: {
          tokenUrl: "https://example.com/token",
          refreshUrl: "https://example.com/refresh",
          availableScopes: { "orders:write": "Write orders" },
        },
        authorizationCode: {
          authorizationUrl: "https://example.com/authorize",
          tokenUrl: "https://example.com/token",
          refreshUrl: "https://example.com/refresh",
          availableScopes: { "orders:read": "Read orders", "orders:write": "Write orders" },
        },
      },
      scopes: ["orders:write"],
    });
    // The flows object is the most intricate structure this emitter writes,
    // and the shape above is one this project decided on. The official
    // parser is the judge of whether all four flows together are accepted.
    await expect(doc).toBeValidAsyncAPI();
  });

  it("rejects a url the flow forbids", async () => {
    // A `tokenUrl` inside `implicit` makes the whole scheme fail the
    // AsyncAPI schema. The flow models declare the URLs their flow allows,
    // so the type checker answers this one.
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        flows: #{
          implicit: #{
            authorizationUrl: "https://example.com/authorize",
            tokenUrl: "https://example.com/token",
            availableScopes: #{}
          }
        }
      })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [{ code: "invalid-argument" }]);
    expect(buildSecuritySchemes(runner.program)).toBeUndefined();
  });

  it("drops a blank refresh url without reporting a missing one", async () => {
    // `refreshUrl` is optional on every flow, so a blank one is left out
    // rather than reported. Only a URL the flow requires is reported.
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        flows: #{
          clientCredentials: #{
            tokenUrl: "  https://example.com/token  ",
            refreshUrl: "   ",
            availableScopes: #{}
          }
        }
      })
      namespace Test;
    `);

    expect(doc.components.securitySchemes.oauth.flows).toEqual({
      clientCredentials: { tokenUrl: "https://example.com/token", availableScopes: {} },
    });
  });

  it("trims the scope descriptions and the needed scope names", async () => {
    // A scope name is a key the author chose, so it is kept as written. A
    // blank entry of `scopes` names no scope at all, so it is dropped and
    // reported. The scheme survives, so the diagnostic is a warning.
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        scopes: #["  orders:write  ", "   "],
        flows: #{
          clientCredentials: #{
            tokenUrl: "https://example.com/token",
            availableScopes: #{ \`orders:write\`: "  Write orders  " }
          }
        }
      })
      namespace Test;
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/blank-security-scope-name",
        severity: "warning",
        message: /The `scopes` of this security scheme hold an entry that is blank/,
      },
    ]);
    expect(doc.components.securitySchemes.oauth.scopes).toEqual(["orders:write"]);
    expect(doc.components.securitySchemes.oauth.flows.clientCredentials.availableScopes).toEqual({
      "orders:write": "Write orders",
    });
  });

  it("reports a scopes list whose entries are all blank, rather than emptying it in silence", async () => {
    // AsyncAPI reads the empty list as "this scheme needs no scope". The
    // author asked for two scopes here, so a silent drop would leave the
    // document asserting the opposite of what was written.
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
      @service(#{ title: "Orders" })
      @securityScheme("oidc", #{
        type: "openIdConnect",
        openIdConnectUrl: "https://example.com/.well-known/openid-configuration",
        scopes: #["  ", ""]
      })
      namespace Test;
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/blank-security-scope-name",
        severity: "warning",
        message: /The `scopes` of this security scheme hold an entry that is blank/,
      },
    ]);
    expect(doc.components.securitySchemes.oidc.scopes).toEqual([]);
  });

  it("keeps a blank scope description as an empty string", async () => {
    // This is the one string of this phase that a blank value does not
    // remove. `availableScopes` is a map, and AsyncAPI requires a value for
    // every key of it, so there is nothing to leave absent. Dropping the
    // entry instead would take away a scope the author declared.
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        flows: #{
          clientCredentials: #{
            tokenUrl: "https://example.com/token",
            availableScopes: #{ \`orders:read\`: "   " }
          }
        }
      })
      namespace Test;
    `);

    expect(doc.components.securitySchemes.oauth.flows.clientCredentials.availableScopes).toEqual({
      "orders:read": "",
    });
    await expect(doc).toBeValidAsyncAPI();
  });

  it("emits an empty scopes list, which asks for no scope at all", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        scopes: #[],
        flows: #{
          clientCredentials: #{
            tokenUrl: "https://example.com/token",
            availableScopes: #{}
          }
        }
      })
      namespace Test;
    `);

    expect(doc.components.securitySchemes.oauth.scopes).toEqual([]);
  });

  it("omits scopes when the author gave none, on both kinds that take them", async () => {
    // An absent `scopes` and an empty one say different things. The empty
    // one asks for no scope, and the absent one says nothing at all. So a
    // scheme without the field must not grow one.
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        flows: #{
          clientCredentials: #{
            tokenUrl: "https://example.com/token",
            availableScopes: #{}
          }
        }
      })
      @securityScheme("oidc", #{
        type: "openIdConnect",
        openIdConnectUrl: "https://example.com/.well-known/openid-configuration"
      })
      namespace Test;
    `);

    expect(doc.components.securitySchemes.oauth).not.toHaveProperty("scopes");
    expect(doc.components.securitySchemes.oidc).not.toHaveProperty("scopes");
  });

  it("omits a description that is absent or blank", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("absent", #{ type: "plain" })
      @securityScheme("blank", #{ type: "plain", description: "   " })
      namespace Test;
    `);

    expect(doc.components.securitySchemes.absent).not.toHaveProperty("description");
    expect(doc.components.securitySchemes.blank).not.toHaveProperty("description");
  });

  it("omits bearerFormat when it is blank, and from any scheme but bearer", async () => {
    // The library declares `bearerFormat` on the bearer model alone, and
    // that model pins `scheme` to the literal 'bearer'. So the type checker
    // rejects the field next to any other scheme before the builder sees it.
    // The two cases left to the builder are the blank value and the trimmed
    // comparison, and both are here.
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("blankFormat", #{ type: "http", scheme: "bearer", bearerFormat: "   " })
      @securityScheme("padded", #{ type: "http", scheme: "  bearer  " })
      @securityScheme("basic", #{ type: "http", scheme: "basic" })
      namespace Test;
    `);

    expect(doc.components.securitySchemes.blankFormat).toEqual({
      type: "http",
      scheme: "bearer",
    });
    // The trimmed value is the one the guard compares, so this scheme takes
    // the bearer branch and still emits no `bearerFormat`.
    expect(doc.components.securitySchemes.padded).toEqual({ type: "http", scheme: "bearer" });
    expect(doc.components.securitySchemes.basic).not.toHaveProperty("bearerFormat");
  });

  it("omits the securitySchemes key when the program declares none", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @server("production", #{ host: "kafka.example.com", protocol: "kafka" })
      namespace Test;
    `);

    expect(doc).not.toHaveProperty("components");
  });

  it("puts the schemes next to the schemas and the messages of one document", async () => {
    // `components` merges three sources. Every other scheme test declares a
    // program with no message and no schema, so this is the one case where
    // all three contribute at once.
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("scram", #{ type: "scramSha512" })
      namespace Test;

      model Item {
        sku: string;
      }

      @message
      model OrderPlaced {
        item: Item;
      }
    `);

    expect(Object.keys(doc.components)).toEqual(["schemas", "messages", "securitySchemes"]);
    expect(Object.keys(doc.components.schemas)).toEqual(["Item", "OrderPlaced"]);
    expect(Object.keys(doc.components.messages)).toEqual(["OrderPlaced"]);
    expect(doc.components.securitySchemes).toEqual({ scram: { type: "scramSha512" } });
  });

  it("collects a scheme declared outside the service namespace", async () => {
    // The schemes are a document-wide registry, unlike the servers, which
    // the emitter reads from the service namespace only.
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      namespace Test;

      @securityScheme("scram", #{ type: "scramSha512" })
      namespace Test.Sub {}
    `);

    expect(doc.components.securitySchemes).toEqual({ scram: { type: "scramSha512" } });
  });

  it("emits the schemes in source order", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("aaa", #{ type: "plain" })
      @securityScheme("bbb", #{ type: "plain" })
      namespace Test;

      @@securityScheme(Test, "ccc", #{ type: "plain" });
    `);

    expect(Object.keys(doc.components.securitySchemes)).toEqual(["aaa", "bbb", "ccc"]);
  });

  it("applies one augment decorator once when its namespace is reopened", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      namespace Test {}
      namespace Test {}

      @@securityScheme(Test, "only", #{ type: "plain" });
    `);

    expect(doc.components.securitySchemes).toEqual({ only: { type: "plain" } });
  });

  it("keeps a scheme named __proto__ as a real entry", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @securityScheme("__proto__", #{ type: "plain" })
      @securityScheme("ok", #{ type: "plain" })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnosticEmpty(diagnostics);
    const schemes = buildSecuritySchemes(runner.program) ?? {};
    expect(Object.keys(schemes)).toEqual(["__proto__", "ok"]);
    expect(Object.getOwnPropertyDescriptor(schemes, "__proto__")?.value).toEqual({ type: "plain" });
    expect(JSON.stringify(schemes)).toContain('"__proto__":{"type":"plain"}');
  });

  it("keeps the recorded scheme safe from a change to the returned copy", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        description: "The identity provider.",
        flows: #{
          implicit: #{
            authorizationUrl: "https://example.com/authorize",
            availableScopes: #{ \`orders:read\`: "Read orders" }
          }
        }
      })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnosticEmpty(diagnostics);
    // The flows are a nested graph. A shallow copy of the scheme would hand
    // the caller the recorded flows themselves, so the nested object is the
    // one worth changing here.
    const copy = getSecuritySchemes(runner.program)[0].scheme;
    copy.description = "mutated";
    // The fallback keeps the types happy. A scheme that lost its flows fails
    // the assertion below, which expects the whole recorded scheme.
    const implicit = copy.flows?.implicit ?? { availableScopes: {} };
    implicit.availableScopes["orders:read"] = "mutated";
    implicit.authorizationUrl = "https://mutated.example.com";

    expect(getSecuritySchemes(runner.program)[0].scheme).toEqual({
      type: "oauth2",
      description: "The identity provider.",
      flows: {
        implicit: {
          authorizationUrl: "https://example.com/authorize",
          availableScopes: { "orders:read": "Read orders" },
        },
      },
    });
  });

  it("reports a scheme name with an illegal character and drops it", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @securityScheme("has space", #{ type: "plain" })
      @securityScheme("dots.are.fine", #{ type: "plain" })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/invalid-security-scheme-name",
        severity: "error",
        message: /Invalid security scheme name: 'has space'/,
      },
    ]);
    expect(Object.keys(buildSecuritySchemes(runner.program) ?? {})).toEqual(["dots.are.fine"]);
  });

  it("reports two schemes that share a name and keeps the first in source order", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @securityScheme("dup", #{ type: "plain", description: "first" })
      @securityScheme("dup", #{ type: "plain", description: "second" })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/duplicate-security-scheme-name",
        severity: "error",
        message: /Duplicate security scheme name: 'dup'/,
      },
    ]);
    expect(buildSecuritySchemes(runner.program)).toEqual({
      dup: { type: "plain", description: "first" },
    });
  });

  it("reports a name clash across two namespaces", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @securityScheme("dup", #{ type: "plain", description: "first" })
      namespace ${t.namespace("Test")} {
        @securityScheme("dup", #{ type: "plain", description: "second" })
        namespace Sub {}
      }
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/duplicate-security-scheme-name",
        severity: "error",
        message: /Duplicate security scheme name: 'dup'/,
      },
    ]);
    expect(buildSecuritySchemes(runner.program)).toEqual({
      dup: { type: "plain", description: "first" },
    });
  });

  it("keeps the stacked scheme when an augment decorator repeats its name", async () => {
    // An augment decorator runs after every stacked one, so the clash is
    // found with the later application in hand. The other clash tests run
    // the two the other way round, because stacked decorators run bottom-up.
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @securityScheme("dup", #{ type: "plain", description: "stacked" })
      namespace ${t.namespace("Test")} {}

      @@securityScheme(Test, "dup", #{ type: "plain", description: "augment" });
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/duplicate-security-scheme-name",
        severity: "error",
        message: /Duplicate security scheme name: 'dup'/,
      },
    ]);
    expect(buildSecuritySchemes(runner.program)).toEqual({
      dup: { type: "plain", description: "stacked" },
    });
  });

  it("keeps the first scheme in source order when three share a name", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @securityScheme("dup", #{ type: "plain", description: "first" })
      @securityScheme("dup", #{ type: "plain", description: "second" })
      @securityScheme("dup", #{ type: "plain", description: "third" })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/duplicate-security-scheme-name",
        severity: "error",
        message: /Duplicate security scheme name: 'dup'/,
      },
      {
        code: "tsp-asyncapi/duplicate-security-scheme-name",
        severity: "error",
        message: /Duplicate security scheme name: 'dup'/,
      },
    ]);
    expect(buildSecuritySchemes(runner.program)).toEqual({
      dup: { type: "plain", description: "first" },
    });
  });

  it("reports a blank required field and drops the scheme", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @securityScheme("blankName", #{ type: "httpApiKey", name: "   ", in: "header" })
      @securityScheme("blankScheme", #{ type: "http", scheme: "" })
      @securityScheme("blankUrl", #{ type: "openIdConnect", openIdConnectUrl: " " })
      namespace ${t.namespace("Test")} {}
    `);

    // Stacked decorators run from the bottom up, so the last one written
    // reports first.
    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/empty-security-scheme-field",
        severity: "error",
        message: /Empty security scheme field: 'openIdConnectUrl'/,
      },
      {
        code: "tsp-asyncapi/empty-security-scheme-field",
        severity: "error",
        message: /Empty security scheme field: 'scheme'/,
      },
      {
        code: "tsp-asyncapi/empty-security-scheme-field",
        severity: "error",
        message: /Empty security scheme field: 'name'/,
      },
    ]);
    expect(buildSecuritySchemes(runner.program)).toBeUndefined();
  });

  it("reports an oauth2 scheme that declares no flow", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{ type: "oauth2", flows: #{} })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      { code: "tsp-asyncapi/empty-oauth-flows", severity: "error", message: /declares no flow/ },
    ]);
    expect(buildSecuritySchemes(runner.program)).toBeUndefined();
  });

  it("reports a flow that is missing an authorization url", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        flows: #{ implicit: #{ availableScopes: #{} } }
      })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/missing-oauth-flow-url",
        severity: "error",
        message: /The 'implicit' OAuth flow needs a 'authorizationUrl'/,
      },
    ]);
    expect(buildSecuritySchemes(runner.program)).toBeUndefined();
  });

  it("reports a blank token url the same way as a missing one", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        flows: #{ clientCredentials: #{ tokenUrl: "   ", availableScopes: #{} } }
      })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/missing-oauth-flow-url",
        severity: "error",
        message: /The 'clientCredentials' OAuth flow needs a 'tokenUrl'/,
      },
    ]);
    expect(buildSecuritySchemes(runner.program)).toBeUndefined();
  });

  it("drops the whole scheme when one flow of several is unusable", async () => {
    // The good flow does not reach the document on its own. A scheme that
    // carries half of what the author wrote would be a scheme nobody asked
    // for. The empty-flows check stays quiet here, because the flows object
    // is not empty. The author wrote a flow, and that flow was rejected.
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        flows: #{
          implicit: #{
            authorizationUrl: "https://example.com/authorize",
            availableScopes: #{}
          },
          password: #{ availableScopes: #{} }
        }
      })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/missing-oauth-flow-url",
        severity: "error",
        message: /The 'password' OAuth flow needs a 'tokenUrl'/,
      },
    ]);
    expect(buildSecuritySchemes(runner.program)).toBeUndefined();
  });

  it("reports both urls the authorization code flow needs", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        flows: #{ authorizationCode: #{ availableScopes: #{} } }
      })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/missing-oauth-flow-url",
        severity: "error",
        message: /The 'authorizationCode' OAuth flow needs a 'authorizationUrl'/,
      },
      {
        code: "tsp-asyncapi/missing-oauth-flow-url",
        severity: "error",
        message: /The 'authorizationCode' OAuth flow needs a 'tokenUrl'/,
      },
    ]);
    expect(buildSecuritySchemes(runner.program)).toBeUndefined();
  });

  it("reports a flow url that is not an absolute url", async () => {
    // AsyncAPI marks every flow url with the `uri` format, and the official
    // parser rejects the whole document over a relative one. So the scheme
    // is dropped here rather than emitted.
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        flows: #{
          implicit: #{
            authorizationUrl: "/authorize",
            availableScopes: #{ \`orders:read\`: "Read orders" }
          }
        }
      })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/invalid-url",
        severity: "error",
        message: /The 'implicit.authorizationUrl' value '\/authorize' is not an absolute URL/,
      },
    ]);
    expect(buildSecuritySchemes(runner.program)).toBeUndefined();
  });

  it("reports a refresh url that is not an absolute url", async () => {
    // `refreshUrl` is optional, so a blank one is left out without a word.
    // A value the author meant as an address carries the same absolute-url
    // rule as the required ones.
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        flows: #{
          clientCredentials: #{
            tokenUrl: "https://example.com/token",
            refreshUrl: "/refresh",
            availableScopes: #{}
          }
        }
      })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/invalid-url",
        severity: "error",
        message: /The 'clientCredentials.refreshUrl' value '\/refresh' is not an absolute URL/,
      },
    ]);
    expect(buildSecuritySchemes(runner.program)).toBeUndefined();
  });

  it("reports an openIdConnectUrl that is not an absolute url", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @securityScheme("oidc", #{ type: "openIdConnect", openIdConnectUrl: "not a url" })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/invalid-url",
        severity: "error",
        message: /The 'openIdConnectUrl' value 'not a url' is not an absolute URL/,
      },
    ]);
    expect(buildSecuritySchemes(runner.program)).toBeUndefined();
  });

  it("emits the schemes of a parent and a nested namespace in source order", async () => {
    // The schemes are collected per namespace and then sorted by source
    // position. The sort is what keeps the emitted key order independent of
    // the order the compiler visited the namespaces in, so the case worth
    // testing interleaves the two namespaces.
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("aaa", #{ type: "plain" })
      namespace Test {
        @securityScheme("bbb", #{ type: "plain" })
        namespace Sub {}
      }

      @@securityScheme(Test, "ccc", #{ type: "plain" });
    `);

    expect(Object.keys(doc.components.securitySchemes)).toEqual(["aaa", "bbb", "ccc"]);
  });
});
