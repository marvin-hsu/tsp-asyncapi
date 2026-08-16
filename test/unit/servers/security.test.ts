/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect } from "vitest";
import { expectDiagnosticEmpty, expectDiagnostics, t } from "@typespec/compiler/testing";
import { AsyncAPITester } from "../../../src/testing/index.js";
import { buildSecuritySchemes } from "../../../src/builders/security-schemes.js";
import { reportSecurityUsesWithoutServer } from "../../../src/builders/servers.js";
import { getSecuritySchemes, getUsedSecuritySchemes } from "../../../src/decorators/index.js";
import { buildServersFrom } from "../../utils/servers.js";
import { emitAsyncAPI, emitAsyncAPIWithDiagnostics } from "../../utils/test-host.js";
import { ASYNCAPI_VERSION, DEFAULT_INFO_VERSION } from "../../../src/constants.js";

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

describe("Unit: server security", () => {
  it("emits one reference per required scheme, in source order", async () => {
    const doc = await emitAsyncAPI(`
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

    expect(doc.servers.production.security).toEqual([
      { $ref: "#/components/securitySchemes/scram" },
      { $ref: "#/components/securitySchemes/oidc" },
    ]);
  });

  it("puts the same security on every server of the namespace", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("scram", #{ type: "scramSha512" })
      @useSecurity("scram")
      @server("production", #{ host: "prod.example.com", protocol: "kafka" })
      @server("sit", #{ host: "sit.example.com", protocol: "kafka" })
      namespace Test;
    `);

    expect(doc.servers.production.security).toEqual([
      { $ref: "#/components/securitySchemes/scram" },
    ]);
    expect(doc.servers.sit.security).toEqual([{ $ref: "#/components/securitySchemes/scram" }]);
  });

  it("omits the security field when the namespace requires no scheme", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @server("production", #{ host: "kafka.example.com", protocol: "kafka" })
      namespace Test;
    `);

    expect(doc.servers.production).not.toHaveProperty("security");
  });

  it("emits one reference for a scheme name given twice", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("scram", #{ type: "scramSha512" })
      @useSecurity("scram")
      @useSecurity("scram")
      @server("production", #{ host: "kafka.example.com", protocol: "kafka" })
      namespace Test;
    `);

    expect(doc.servers.production.security).toEqual([
      { $ref: "#/components/securitySchemes/scram" },
    ]);
  });

  it("reports a scheme that no securityScheme defines and drops the entry", async () => {
    // The reference would address a key the document does not carry, and the
    // official parser rejects the whole document for it. So the entry is
    // dropped, and the only entry left is the one that resolves.
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
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
    expect(doc.servers.production.security).toEqual([
      { $ref: "#/components/securitySchemes/scram" },
    ]);
    await expect(doc).toBeValidAsyncAPI();
  });

  it("omits the security field when no required scheme is defined", async () => {
    // An empty `security` array is not the same as a missing one. AsyncAPI
    // reads an empty array as "this server needs no scheme at all", which is
    // a claim the author never made.
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
      @service(#{ title: "Orders" })
      @useSecurity("missing")
      @server("production", #{ host: "kafka.example.com", protocol: "kafka" })
      namespace Test;
    `);

    expectDiagnostics(diagnostics, [
      { code: "tsp-asyncapi/undeclared-security-scheme", severity: "warning" },
    ]);
    expect(doc.servers.production).not.toHaveProperty("security");
    await expect(doc).toBeValidAsyncAPI();
  });

  it("applies one augment decorator once when its namespace is reopened", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("scram", #{ type: "scramSha512" })
      @server("production", #{ host: "kafka.example.com", protocol: "kafka" })
      namespace Test {}
      namespace Test {}

      @@useSecurity(Test, "scram");
    `);

    expect(doc.servers.production.security).toEqual([
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
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
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
    expect(buildSecuritySchemes(runner.program)).toBeUndefined();
    expect(getUsedSecuritySchemes(runner.program, Test)).toEqual([]);
  });

  it("reports a useSecurity next to a server outside the service", async () => {
    // Both applications are dropped, and each one is a separate thing the
    // author wrote, so each gets a word.
    //
    // This case used to stay quiet while the sibling case above, where the
    // server is dropped by its own field check, reported. That difference was
    // never decided: a server dropped for a bad field never reaches the state
    // at all, so the namespace read as one with no server, while a server
    // dropped for sitting outside the service does reach the state. The test
    // now pins the question the emitter actually asks, which is whether the
    // namespace puts any server into the document.
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
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
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
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
    // show what the emitter would report.
    reportSecurityUsesWithoutServer(runner.program);
    const stray = runner.program.diagnostics.filter(
      (diagnostic) => diagnostic.code === "tsp-asyncapi/use-security-outside-server",
    );
    expect(stray).toHaveLength(1);
    expect(stray[0].message).toMatch(
      /@useSecurity\('scram'\) on namespace '[\w.]*Test' was dropped/,
    );
  });
});

describe("Unit: Kafka acceptance example", () => {
  it("emits a prod and a sit Kafka broker that both use SCRAM", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("kafka-scram", #{
        type: "scramSha512",
        description: "SASL/SCRAM over TLS."
      })
      @useSecurity("kafka-scram")
      @server("production", #{
        host: "kafka.example.com:9092",
        protocol: "kafka-secure",
        protocolVersion: "3.5.0",
        title: "Production broker",
        description: "The production Kafka cluster."
      })
      @server("sit", #{
        host: "{tenant}.kafka.sit.example.com:9092",
        protocol: "kafka-secure",
        protocolVersion: "3.5.0",
        title: "SIT broker",
        variables: #{
          tenant: #{ default: "acme", \`enum\`: #["acme", "globex"], description: "The tenant." }
        }
      })
      namespace Test;
    `);

    // The whole document is asserted, not the servers alone. A stray
    // top-level field, a lost `info`, or a changed specification version
    // then fails this test as well.
    expect(doc).toEqual({
      asyncapi: ASYNCAPI_VERSION,
      info: { title: "Orders", version: DEFAULT_INFO_VERSION },
      servers: {
        production: {
          host: "kafka.example.com:9092",
          protocol: "kafka-secure",
          protocolVersion: "3.5.0",
          title: "Production broker",
          description: "The production Kafka cluster.",
          security: [{ $ref: "#/components/securitySchemes/kafka-scram" }],
        },
        sit: {
          host: "{tenant}.kafka.sit.example.com:9092",
          protocol: "kafka-secure",
          protocolVersion: "3.5.0",
          title: "SIT broker",
          variables: {
            tenant: { enum: ["acme", "globex"], default: "acme", description: "The tenant." },
          },
          security: [{ $ref: "#/components/securitySchemes/kafka-scram" }],
        },
      },
      channels: {},
      operations: {},
      components: {
        securitySchemes: {
          "kafka-scram": { type: "scramSha512", description: "SASL/SCRAM over TLS." },
        },
      },
    });
    // The shape above is one this project decided on. The official parser
    // decides whether the specification accepts it, and it is the only
    // judge of `security`, `variables` and `securitySchemes` together.
    await expect(doc).toBeValidAsyncAPI();
  });

  it("emits an apiKey and an X509 scheme that one server names together", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("byUser", #{ type: "apiKey", in: "user" })
      @securityScheme("cert", #{ type: "X509", description: "The client certificate." })
      @useSecurity("byUser")
      @useSecurity("cert")
      @server("production", #{ host: "mqtt.example.com", protocol: "mqtt" })
      namespace Test;
    `);

    expect(doc.servers.production.security).toEqual([
      { $ref: "#/components/securitySchemes/byUser" },
      { $ref: "#/components/securitySchemes/cert" },
    ]);
    await expect(doc).toBeValidAsyncAPI();
  });

  it("emits an oauth2 scheme with no scopes that a server names", async () => {
    const doc = await emitAsyncAPI(`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        flows: #{
          clientCredentials: #{
            tokenUrl: "https://example.com/token",
            availableScopes: #{ \`orders:read\`: "Read orders" }
          }
        }
      })
      @useSecurity("oauth")
      @server("production", #{ host: "kafka.example.com", protocol: "kafka" })
      namespace Test;
    `);

    expect(doc.servers.production.security).toEqual([
      { $ref: "#/components/securitySchemes/oauth" },
    ]);
    await expect(doc).toBeValidAsyncAPI();
  });
});

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
