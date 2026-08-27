import { describe, it, expect } from "vitest";
import { t } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing.js";
import { getInfo } from "#core/decorators/index.js";
import { diagnosticsWith, findDiagnostic } from "../../../utils/diagnostics.js";

/**
 * `@info` writes the one object every AsyncAPI document carries, and it used
 * to check none of its fields. Three fields carry the `uri` format, and the
 * official parser rejects a document whose value there is not an absolute
 * URL.
 */
describe("Unit: @info field checks", () => {
  const compile = async (info: string) => {
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      ${info}
      namespace ${t.namespace("Test")} {}
    `);
    return { state: getInfo(runner.program, Test), diagnostics };
  };

  it("reports a blank version and falls back to the default", async () => {
    const { state, diagnostics } = await compile(`@info(#{ version: "  " })`);

    expect(findDiagnostic(diagnostics, "empty-info-version").severity).toBe("error");
    expect(state?.version).toBe("0.0.0");
  });

  it("reports a second @info and keeps the first one that ran", async () => {
    const { state, diagnostics } = await compile(
      `@info(#{ version: "1.0.0" })
      @info(#{ version: "2.0.0" })`,
    );

    expect(findDiagnostic(diagnostics, "duplicate-info-decorator").severity).toBe("error");
    // Decorators on one declaration run bottom-up, so the one written last
    // runs first and wins.
    expect(state?.version).toBe("2.0.0");
  });

  it("drops a termsOfService that is not an absolute URL", async () => {
    const { state, diagnostics } = await compile(
      `@info(#{ version: "1.0.0", termsOfService: "/terms" })`,
    );

    expect(findDiagnostic(diagnostics, "invalid-url").message).toContain("termsOfService");
    expect(state).toEqual({ version: "1.0.0" });
  });

  it("drops a contact url that is not an absolute URL and keeps the rest", async () => {
    const { state, diagnostics } = await compile(
      `@info(#{ version: "1.0.0", contact: #{ name: "Support", url: "support page" } })`,
    );

    expect(findDiagnostic(diagnostics, "invalid-url").message).toContain("contact.url");
    expect(state).toEqual({ version: "1.0.0", contact: { name: "Support" } });
  });

  it("drops a license url that is not an absolute URL and keeps the name", async () => {
    const { state, diagnostics } = await compile(
      `@info(#{ version: "1.0.0", license: #{ name: "MIT", url: "/licenses/MIT" } })`,
    );

    expect(findDiagnostic(diagnostics, "invalid-url").message).toContain("license.url");
    expect(state).toEqual({ version: "1.0.0", license: { name: "MIT" } });
  });

  it("keeps every absolute URL", async () => {
    const { state, diagnostics } = await compile(
      `@info(#{
        version: "1.0.0",
        termsOfService: "https://example.com/terms",
        contact: #{ name: "Support", url: "https://example.com/support" },
        license: #{ name: "MIT", url: "https://opensource.org/licenses/MIT" }
      })`,
    );

    expect(diagnosticsWith(diagnostics, "invalid-url")).toHaveLength(0);
    expect(state).toEqual({
      version: "1.0.0",
      termsOfService: "https://example.com/terms",
      contact: { name: "Support", url: "https://example.com/support" },
      license: { name: "MIT", url: "https://opensource.org/licenses/MIT" },
    });
  });

  it("applies one augment @@info once when its namespace is reopened", async () => {
    // An augment decorator runs once per declaration of its target
    // namespace. A reopened namespace therefore runs the same `@@info`
    // again, and the second run must not look like a second application.
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      namespace ${t.namespace("Test")} {}
      namespace Test {}

      @@info(Test, #{ version: "1.0.0" });
    `);

    expect(diagnosticsWith(diagnostics, "duplicate-info-decorator")).toHaveLength(0);
    expect(getInfo(runner.program, Test)?.version).toBe("1.0.0");
  });
});
