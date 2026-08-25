import { describe, it, expect } from "vitest";
import { AvroTester } from "#avro/testing.js";
import { $lib, PACKAGE_NAME } from "#avro/lib.js";

/**
 * The skeleton of the Avro package.
 *
 * These tests pin the three things a package has to get right before it holds
 * any behaviour. The compiler resolves the library by package name. The
 * library name is the prefix of every diagnostic code. The emitter loads and
 * runs.
 */
describe("tsp-avro skeleton", () => {
  it("registers under the package name", () => {
    expect($lib.name).toBe(PACKAGE_NAME);
  });

  it("compiles a source that imports the library, and writes no file", async () => {
    const [result, diagnostics] = await AvroTester.emit(PACKAGE_NAME).compileAndDiagnose(
      `model OrderPlaced { id: string; }`,
    );

    // An emitter the compiler cannot resolve is reported here as
    // `emitter-not-found`. So an empty list is what proves the compiler found
    // this package and ran its `$onEmit`.
    expect(diagnostics).toHaveLength(0);
    expect(Object.keys(result.outputs)).toEqual([]);
  });

  it("writes no file when the compilation already reported an error", async () => {
    const [result, diagnostics] = await AvroTester.emit(PACKAGE_NAME).compileAndDiagnose(
      `model OrderPlaced { id: NoSuchType; }`,
    );

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(Object.keys(result.outputs)).toEqual([]);
  });

  it("rejects an option the emitter does not declare", async () => {
    const [, diagnostics] = await AvroTester.emit(PACKAGE_NAME, {
      "output-file": "orders.avsc",
    }).compileAndDiagnose(`model OrderPlaced { id: string; }`);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["invalid-schema"]);
  });
});
