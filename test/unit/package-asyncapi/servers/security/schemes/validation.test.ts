import { describe, it, expect } from "vitest";
import { expectDiagnostics, t } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing.js";
import { builtSecuritySchemes } from "../../../../../utils/security-schemes.js";
import { emitDocument } from "../../../../../utils/test-host.js";
import { securitySchemesOf } from "../../../../../utils/document.js";

describe("Unit: security schemes — required fields and urls", () => {
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
    expect(builtSecuritySchemes(runner.program)).toBeUndefined();
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
    expect(builtSecuritySchemes(runner.program)).toBeUndefined();
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
    expect(builtSecuritySchemes(runner.program)).toBeUndefined();
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
    expect(builtSecuritySchemes(runner.program)).toBeUndefined();
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
    expect(builtSecuritySchemes(runner.program)).toBeUndefined();
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
    expect(builtSecuritySchemes(runner.program)).toBeUndefined();
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
    expect(builtSecuritySchemes(runner.program)).toBeUndefined();
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
    expect(builtSecuritySchemes(runner.program)).toBeUndefined();
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
    expect(builtSecuritySchemes(runner.program)).toBeUndefined();
  });

  it("emits the schemes of a parent and a nested namespace in source order", async () => {
    // The schemes are collected per namespace and then sorted by source
    // position. The sort is what keeps the emitted key order independent of
    // the order the compiler visited the namespaces in, so the case worth
    // testing interleaves the two namespaces.
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @securityScheme("aaa", #{ type: "plain" })
      namespace Test {
        @securityScheme("bbb", #{ type: "plain" })
        namespace Sub {}
      }

      @@securityScheme(Test, "ccc", #{ type: "plain" });
    `);

    expect(Object.keys(securitySchemesOf(doc))).toEqual(["aaa", "bbb", "ccc"]);
  });
});
