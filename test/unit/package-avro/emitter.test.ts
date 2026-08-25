import { describe, it, expect, vi } from "vitest";
import type { EmitContext, Program } from "@typespec/compiler";
import { AvroTester } from "#avro/testing.js";
import { $onEmit } from "#avro/emitter.js";
import { $lib, PACKAGE_NAME } from "#avro/lib.js";
import type { AvroEmitterOptions } from "#avro/lib.js";

/**
 * The package itself, and the decisions the emitter makes before any walk.
 *
 * Two of these tests go through the compiler, which loads the library and the
 * emitter by package name from the build output. That is the only thing that
 * proves the package name, the entry point and the decorator bindings agree.
 * Every other Avro test drives the emitter from the source instead, through
 * the harness.
 */

/**
 * The emit context, with the two members this emitter reads.
 *
 * The compiler builds a larger one, and nothing here touches the rest of it.
 */
function emitContextFor(program: Program): EmitContext<AvroEmitterOptions> {
  return { program, emitterOutputDir: "/out", options: {} } as EmitContext<AvroEmitterOptions>;
}

describe("tsp-avro", () => {
  it("registers under the package name", () => {
    expect($lib.name).toBe(PACKAGE_NAME);
  });

  it("is found by the compiler, and writes the record it is asked for", async () => {
    // An emitter the compiler cannot resolve is reported as
    // `emitter-not-found`, and a decorator it cannot bind is reported as an
    // unknown decorator. So an empty diagnostic list plus one file is what
    // proves the whole wiring holds.
    const [result, diagnostics] = await AvroTester.emit(PACKAGE_NAME).compileAndDiagnose(`
      @Avro.\`namespace\`("com.example.orders")
      namespace Orders {
        @Avro.\`record\` model OrderPlaced { id: string; }
      }
    `);

    expect(diagnostics).toEqual([]);
    expect(Object.keys(result.outputs)).toEqual(["com/example/orders/OrderPlaced.avsc"]);
  });

  it("writes no file for a source that marks nothing", async () => {
    const [result, diagnostics] = await AvroTester.emit(PACKAGE_NAME).compileAndDiagnose(
      `model OrderPlaced { id: string; }`,
    );

    expect(diagnostics).toEqual([]);
    expect(Object.keys(result.outputs)).toEqual([]);
  });

  it("rejects an option the emitter does not declare", async () => {
    const [, diagnostics] = await AvroTester.emit(PACKAGE_NAME, {
      "output-file": "orders.avsc",
    }).compileAndDiagnose(`model OrderPlaced { id: string; }`);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["invalid-schema"]);
  });

  it("writes nothing on a dry run", async () => {
    // A dry run asks the compiler to say what would happen, not to make it
    // happen.
    const runner = await AvroTester.createInstance();
    await runner.compile(`
      @Avro.\`namespace\`("com.example.a")
      namespace A { @Avro.\`record\` model Event { id: string; } }
    `);

    const writeFile = vi.spyOn(runner.program.host, "writeFile");
    runner.program.compilerOptions.dryRun = true;

    await $onEmit(emitContextFor(runner.program));

    expect(writeFile).not.toHaveBeenCalled();
  });

  it("writes the same run when it is not a dry run", async () => {
    const runner = await AvroTester.createInstance();
    await runner.compile(`
      @Avro.\`namespace\`("com.example.a")
      namespace A { @Avro.\`record\` model Event { id: string; } }
    `);

    const writeFile = vi.spyOn(runner.program.host, "writeFile");

    await $onEmit(emitContextFor(runner.program));

    expect(writeFile).toHaveBeenCalledWith("/out/com/example/a/Event.avsc", expect.any(String));
  });
});
