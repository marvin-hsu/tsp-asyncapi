import { describe, it, expect } from "vitest";
import { expectDiagnostics, t } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing.js";
import { builtSecuritySchemes } from "../../../../../utils/security-schemes.js";
import { emitDocument, emitDocumentWithDiagnostics } from "../../../../../utils/test-host.js";
import { present, securitySchemesOf } from "../../../../../utils/document.js";

describe("Unit: security schemes — OAuth flows and scopes", () => {
  it("emits the whole flows structure of an oauth2 scheme", async () => {
    const doc = await emitDocument(`
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

    expect(securitySchemesOf(doc).oauth).toEqual({
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
    expect(builtSecuritySchemes(runner.program)).toBeUndefined();
  });

  it("drops a blank refresh url without reporting a missing one", async () => {
    // `refreshUrl` is optional on every flow, so a blank one is left out
    // rather than reported. Only a URL the flow requires is reported.
    const doc = await emitDocument(`
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

    expect(securitySchemesOf(doc).oauth.flows).toEqual({
      clientCredentials: { tokenUrl: "https://example.com/token", availableScopes: {} },
    });
  });

  it("trims the scope descriptions and the needed scope names", async () => {
    // A scope name is a key the author chose, so it is kept as written. A
    // blank entry of `scopes` names no scope at all, so it is dropped and
    // reported. The scheme survives, so the diagnostic is a warning.
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
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
    expect(securitySchemesOf(doc).oauth.scopes).toEqual(["orders:write"]);
    expect(
      present(
        present(securitySchemesOf(doc).oauth.flows, "oauth flows").clientCredentials,
        "clientCredentials flow",
      ).availableScopes,
    ).toEqual({
      "orders:write": "Write orders",
    });
  });

  it("reports a scopes list whose entries are all blank, rather than emptying it in silence", async () => {
    // AsyncAPI reads the empty list as "this scheme needs no scope". The
    // author asked for two scopes here, so a silent drop would leave the
    // document asserting the opposite of what was written.
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
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
    expect(securitySchemesOf(doc).oidc.scopes).toEqual([]);
  });

  it("keeps a blank scope description as an empty string", async () => {
    // This is the one string of this phase that a blank value does not
    // remove. `availableScopes` is a map, and AsyncAPI requires a value for
    // every key of it, so there is nothing to leave absent. Dropping the
    // entry instead would take away a scope the author declared.
    const doc = await emitDocument(`
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

    expect(
      present(
        present(securitySchemesOf(doc).oauth.flows, "oauth flows").clientCredentials,
        "clientCredentials flow",
      ).availableScopes,
    ).toEqual({
      "orders:read": "",
    });
    await expect(doc).toBeValidAsyncAPI();
  });

  it("emits an empty scopes list, which asks for no scope at all", async () => {
    const doc = await emitDocument(`
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

    expect(securitySchemesOf(doc).oauth.scopes).toEqual([]);
  });

  it("omits scopes when the author gave none, on both kinds that take them", async () => {
    // An absent `scopes` and an empty one say different things. The empty
    // one asks for no scope, and the absent one says nothing at all. So a
    // scheme without the field must not grow one.
    const doc = await emitDocument(`
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

    expect(securitySchemesOf(doc).oauth).not.toHaveProperty("scopes");
    expect(securitySchemesOf(doc).oidc).not.toHaveProperty("scopes");
  });

  it("reports a needed scope that no flow offers, and still emits the name", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        scopes: #["orders:write", "orders:admin"],
        flows: #{
          clientCredentials: #{
            tokenUrl: "https://example.com/token",
            availableScopes: #{ \`orders:read\`: "Read orders", \`orders:write\`: "Write orders" }
          }
        }
      })
      namespace Test;
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/unknown-oauth-scope",
        severity: "warning",
        message: /The scope 'orders:admin' is not listed in `availableScopes`/,
      },
    ]);
    expect(securitySchemesOf(doc).oauth.scopes).toEqual(["orders:write", "orders:admin"]);
  });
});
