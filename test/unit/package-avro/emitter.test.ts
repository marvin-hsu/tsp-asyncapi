import { describe, it, expect, vi } from "vitest";
import { AvroTester } from "#avro/testing.js";
import { $onEmit } from "#avro/emitter.js";
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

  it("writes no file when it is called directly", async () => {
    const runner = await AvroTester.createInstance();
    await runner.compile(`model OrderPlaced { id: string; }`);

    // The call above goes through the compiler, which loads the emitter from
    // the build output. This one calls the source copy, which is the copy the
    // coverage report is about. It is also where the walk will be driven from
    // once it exists, without a compilation for every case.
    const writeFile = vi.spyOn(runner.program.host, "writeFile");

    $onEmit();

    expect(writeFile).not.toHaveBeenCalled();
  });

  it("rejects an option the emitter does not declare", async () => {
    const [, diagnostics] = await AvroTester.emit(PACKAGE_NAME, {
      "output-file": "orders.avsc",
    }).compileAndDiagnose(`model OrderPlaced { id: string; }`);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["invalid-schema"]);
  });
});
