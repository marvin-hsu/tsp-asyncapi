import { describe, it, expect } from "vitest";
import { expectDiagnostics, t } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing/index.js";
import { builtSecuritySchemes } from "../../../../utils/security-schemes.js";
import { emitDocument } from "../../../../utils/test-host.js";
import { securitySchemesOf } from "../../../../utils/document.js";

describe("Unit: security schemes — the shape of each type", () => {
  it("emits the eight schemes that carry only a type", async () => {
    const doc = await emitDocument(`
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

    expect(securitySchemesOf(doc)).toEqual({
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
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @securityScheme("byUser", #{ type: "apiKey", in: "user" })
      @securityScheme("byPassword", #{ type: "apiKey", in: "password" })
      namespace Test;
    `);

    expect(securitySchemesOf(doc)).toEqual({
      byUser: { type: "apiKey", in: "user" },
      byPassword: { type: "apiKey", in: "password" },
    });
  });

  it("emits an httpApiKey scheme with its name and location", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @securityScheme("hdr", #{ type: "httpApiKey", name: "X-Api-Key", in: "header" })
      @securityScheme("qry", #{ type: "httpApiKey", name: "api_key", in: "query" })
      @securityScheme("cke", #{ type: "httpApiKey", name: "sid", in: "cookie" })
      namespace Test;
    `);

    expect(securitySchemesOf(doc)).toEqual({
      hdr: { type: "httpApiKey", name: "X-Api-Key", in: "header" },
      qry: { type: "httpApiKey", name: "api_key", in: "query" },
      cke: { type: "httpApiKey", name: "sid", in: "cookie" },
    });
  });

  it("emits an http scheme with its bearer format", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @securityScheme("bearer", #{ type: "http", scheme: "bearer", bearerFormat: "JWT" })
      @securityScheme("basic", #{ type: "http", scheme: "basic" })
      namespace Test;
    `);

    expect(securitySchemesOf(doc)).toEqual({
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
    expect(builtSecuritySchemes(runner.program)).toBeUndefined();
  });

  it("emits a scheme description and drops a blank bearer format", async () => {
    const doc = await emitDocument(`
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

    expect(securitySchemesOf(doc)).toEqual({
      bearer: { type: "http", scheme: "bearer", description: "A bearer token." },
      basic: { type: "http", scheme: "basic" },
    });
  });

  it("emits an openIdConnect scheme with its url and scopes", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @securityScheme("oidc", #{
        type: "openIdConnect",
        openIdConnectUrl: "https://example.com/.well-known/openid-configuration",
        scopes: #["orders:read"]
      })
      namespace Test;
    `);

    expect(securitySchemesOf(doc).oidc).toEqual({
      type: "openIdConnect",
      openIdConnectUrl: "https://example.com/.well-known/openid-configuration",
      scopes: ["orders:read"],
    });
  });
});
