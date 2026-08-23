import { describe, it, expect } from "vitest";
import { expectDiagnostics, t } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing.js";
import { builtSecuritySchemes } from "../../../../../utils/security-schemes.js";

describe("Unit: security schemes — name errors", () => {
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
    expect(Object.keys(builtSecuritySchemes(runner.program) ?? {})).toEqual(["dots.are.fine"]);
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
    expect(builtSecuritySchemes(runner.program)).toEqual({
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
    expect(builtSecuritySchemes(runner.program)).toEqual({
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
    expect(builtSecuritySchemes(runner.program)).toEqual({
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
    expect(builtSecuritySchemes(runner.program)).toEqual({
      dup: { type: "plain", description: "first" },
    });
  });
});
