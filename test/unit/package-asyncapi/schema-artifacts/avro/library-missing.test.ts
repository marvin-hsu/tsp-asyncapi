/**
 * What happens when the Avro library is not installed.
 *
 * `tsp-avro` is an optional peer dependency, so a project can turn the feature
 * on and not have it. The provider loads it at run time, and a load that fails
 * is a broken install rather than a source the walk refused.
 *
 * The provider says so and refuses everything. A document written without it
 * would carry ordinary JSON Schema for every model the project wanted Avro
 * for, and nothing in the file would say so.
 *
 * A broken install cannot be arranged from a TypeSpec source, so a failing
 * loader is stated here. The loader only fails. The code that reads the
 * failure and reports it is the provider's, and that is what these cases
 * measure.
 */

import { describe, expect, it } from "vitest";
import { createTester } from "@typespec/compiler/testing";
import { fileURLToPath } from "node:url";
import { PACKAGE_NAME } from "#emitter/lib.js";
import { createAvroProvider } from "#emitter/schema-artifacts/avro.js";
import { collectSchemaArtifacts } from "#emitter/schema-artifacts/provider.js";
import { diagnosticsWith } from "../../../../utils/diagnostics.js";

/** The root of the emitter package, which holds the Avro library beside it. */
const PACKAGE_ROOT = fileURLToPath(
  new URL("../../../../../packages/tsp-asyncapi", import.meta.url),
);

/** A tester that compiles both libraries and runs no emitter. */
const BothLibraries = createTester(PACKAGE_ROOT, {
  libraries: [PACKAGE_NAME, "tsp-avro"],
})
  .importLibraries()
  .using("AsyncAPI");

/** One message model that would get a payload if the library were there. */
const SOURCE = `
  @service(#{ title: "Orders" })
  namespace Test;

  @Avro.avroNamespace("com.example.orders")
  namespace Test.Orders {
    @message
    @Avro.avroRecord
    model OrderPlaced {
      orderId: string;
    }
  }

  @channel("orders.placed")
  interface Placed {
    @send
    op placed(event: Test.Orders.OrderPlaced): void;
  }
`;

/**
 * A loader that fails the way a missing package fails.
 *
 * It only fails. The code that turns a failure into a diagnostic is the
 * provider's, so this case measures the shipped wiring rather than a copy of
 * it written here.
 */
function failToLoad(): Promise<never> {
  return Promise.reject(new Error("Cannot find package 'tsp-avro'."));
}

describe("Unit: the Avro library is not installed", () => {
  it("refuses every model and names the library", async () => {
    const runner = await BothLibraries.createInstance();
    await runner.diagnose(SOURCE);
    const program = runner.program;

    const collected = await collectSchemaArtifacts(program, new Set(["avro"]), [
      createAvroProvider(failToLoad),
    ]);

    // Nothing was produced, and the caller is told to write nothing.
    expect(collected.refused).toBe(true);
    expect(collected.artifacts.payloadFor.size).toBe(0);

    const reported = diagnosticsWith(program.diagnostics, "avro-library-missing");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");
    // The provider targets the global namespace, because a broken install
    // belongs to no model.
    expect(reported[0]?.target).toBe(program.getGlobalNamespaceType());
    // The message names the package, the reason, and the way out.
    expect(reported[0]?.message).toContain("tsp-avro");
    expect(reported[0]?.message).toContain("Cannot find package 'tsp-avro'.");
    expect(reported[0]?.message).toContain("preview-features");
  });

  it("loads the library when the feature is on and answers the model", async () => {
    const runner = await BothLibraries.createInstance();
    await runner.diagnose(SOURCE);
    const program = runner.program;

    // The default loader. This is the case the one above is measured against.
    const collected = await collectSchemaArtifacts(program, new Set(["avro"]), [
      createAvroProvider(),
    ]);

    expect(collected.refused).toBe(false);
    expect(collected.artifacts.payloadFor.size).toBe(1);
    const [artifact] = [...collected.artifacts.payloadFor.values()];
    expect(artifact.provider).toBe("avro");
    // The identity is the Avro full name, which is what tells two apart.
    expect(artifact.identity).toBe("com.example.orders.OrderPlaced");
    expect(diagnosticsWith(program.diagnostics, "avro-library-missing")).toEqual([]);
  });

  it("loads nothing when the feature is off", async () => {
    const runner = await BothLibraries.createInstance();
    await runner.diagnose(SOURCE);
    const program = runner.program;

    let loads = 0;
    const counted = (): Promise<never> => {
      loads += 1;
      return Promise.reject(new Error("The loader was reached."));
    };

    const collected = await collectSchemaArtifacts(program, new Set(), [
      createAvroProvider(counted),
    ]);

    // A project that never turns the feature on never reaches the library.
    expect(loads).toBe(0);
    expect(collected.refused).toBe(false);
    expect(collected.artifacts.payloadFor.size).toBe(0);
  });
});
