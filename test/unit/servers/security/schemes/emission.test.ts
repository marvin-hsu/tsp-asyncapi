import { describe, it, expect } from "vitest";
import { expectDiagnosticEmpty, t } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing.js";
import { builtSecuritySchemes } from "../../../../utils/security-schemes.js";
import { getSecuritySchemes } from "#core/decorators/index.js";
import { emitDocument } from "../../../../utils/test-host.js";
import {
  componentsOf,
  messagesOf,
  schemasOf,
  securitySchemesOf,
} from "../../../../utils/document.js";

describe("Unit: security schemes — what reaches the document", () => {
  it("omits a description that is absent or blank", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @securityScheme("absent", #{ type: "plain" })
      @securityScheme("blank", #{ type: "plain", description: "   " })
      namespace Test;
    `);

    expect(securitySchemesOf(doc).absent).not.toHaveProperty("description");
    expect(securitySchemesOf(doc).blank).not.toHaveProperty("description");
  });

  it("omits bearerFormat when it is blank, and from any scheme but bearer", async () => {
    // The library declares `bearerFormat` on the bearer model alone, and
    // that model pins `scheme` to the literal 'bearer'. So the type checker
    // rejects the field next to any other scheme before the builder sees it.
    // The two cases left to the builder are the blank value and the trimmed
    // comparison, and both are here.
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @securityScheme("blankFormat", #{ type: "http", scheme: "bearer", bearerFormat: "   " })
      @securityScheme("padded", #{ type: "http", scheme: "  bearer  " })
      @securityScheme("basic", #{ type: "http", scheme: "basic" })
      namespace Test;
    `);

    expect(securitySchemesOf(doc).blankFormat).toEqual({
      type: "http",
      scheme: "bearer",
    });
    // The trimmed value is the one the guard compares, so this scheme takes
    // the bearer branch and still emits no `bearerFormat`.
    expect(securitySchemesOf(doc).padded).toEqual({ type: "http", scheme: "bearer" });
    expect(securitySchemesOf(doc).basic).not.toHaveProperty("bearerFormat");
  });

  it("omits the securitySchemes key when the program declares none", async () => {
    const doc = await emitDocument(`
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
    const doc = await emitDocument(`
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

    expect(Object.keys(componentsOf(doc))).toEqual(["schemas", "messages", "securitySchemes"]);
    expect(Object.keys(schemasOf(doc))).toEqual(["Item", "OrderPlaced"]);
    expect(Object.keys(messagesOf(doc))).toEqual(["OrderPlaced"]);
    expect(securitySchemesOf(doc)).toEqual({ scram: { type: "scramSha512" } });
  });

  it("collects a scheme declared outside the service namespace", async () => {
    // The schemes are a document-wide registry, unlike the servers, which
    // the emitter reads from the service namespace only.
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      namespace Test;

      @securityScheme("scram", #{ type: "scramSha512" })
      namespace Test.Sub {}
    `);

    expect(securitySchemesOf(doc)).toEqual({ scram: { type: "scramSha512" } });
  });

  it("emits the schemes in source order", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @securityScheme("aaa", #{ type: "plain" })
      @securityScheme("bbb", #{ type: "plain" })
      namespace Test;

      @@securityScheme(Test, "ccc", #{ type: "plain" });
    `);

    expect(Object.keys(securitySchemesOf(doc))).toEqual(["aaa", "bbb", "ccc"]);
  });

  it("applies one augment decorator once when its namespace is reopened", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      namespace Test {}
      namespace Test {}

      @@securityScheme(Test, "only", #{ type: "plain" });
    `);

    expect(securitySchemesOf(doc)).toEqual({ only: { type: "plain" } });
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
    const schemes = builtSecuritySchemes(runner.program) ?? {};
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
});
