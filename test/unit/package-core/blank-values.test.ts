import { describe, it, expect } from "vitest";
import { AsyncAPITester } from "#emitter/testing.js";
import { findDiagnostic } from "../../utils/diagnostics.js";

/**
 * A blank check that tests `length === 0` lets a string of spaces through.
 * The value then names nothing and still reaches the emitted document.
 */
describe("Unit: blank values that are not empty", () => {
  it("reports an @asyncTag name of spaces", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @asyncTag("  ")
      model OrderCreated {
        id: string;
      }
    `);

    expect(findDiagnostic(diagnostics, "empty-tag-name").severity).toBe("error");
  });

  it("reports a @contentType of spaces", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @contentType("  ")
      model OrderCreated {
        id: string;
      }
    `);

    expect(findDiagnostic(diagnostics, "empty-content-type").severity).toBe("error");
  });

  it("trims the media type it records", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @contentType("  application/json  ")
      model OrderCreated {
        id: string;
      }
    `);

    expect(diagnostics).toEqual([]);
  });
});
