/**
 * What the provider says when the walk refuses a model and names no reason.
 *
 * The walk promises at least one reason with every refusal, so this never
 * happens while the promise holds. The case exists because the diagnostic
 * carries the reason in the middle of a sentence. A missing reason would leave
 * a hole there, and the author would read a message that says a model was
 * refused and nothing about why.
 *
 * The walk cannot be made to break its promise from a TypeSpec source, so the
 * loader hands the provider a walk that refuses in silence. Everything after
 * that call is the shipped path.
 */

import { describe, expect, it } from "vitest";
import { createLibraryTester } from "../../../../utils/emitter-package.js";
import { createAvroProvider, type AvroLoader } from "#emitter/schema-artifacts/avro.js";
import { collectSchemaArtifacts } from "#emitter/schema-artifacts/provider.js";
import { diagnosticsWith } from "../../../../utils/diagnostics.js";

/** A tester that compiles both libraries and runs no emitter. */
const BothLibraries = createLibraryTester("tsp-avro");

/** One message model the real walk answers without complaint. */
const SOURCE = `
  @service(#{ title: "Orders" })
  namespace Test;

  @message
  @Avro.avroRecord
  model OrderPlaced {
    orderId: string;
  }

  @channel("orders.placed")
  interface Placed {
    @send
    op placed(event: OrderPlaced): void;
  }
`;

/**
 * The real library, with a walk that refuses and collects nothing.
 *
 * @returns The library the provider calls
 */
const loadSilentWalk: AvroLoader = async () => {
  const [main, unstable] = await Promise.all([import("tsp-avro"), import("tsp-avro/unstable")]);
  return {
    main,
    unstable: { ...unstable, buildAvroRecordWithDiagnostics: () => [undefined, []] },
  };
};

describe("Unit: the Avro walk refuses without a reason", () => {
  it("says the reason is missing rather than leaving a hole", async () => {
    const runner = await BothLibraries.createInstance();
    await runner.diagnose(SOURCE);
    const program = runner.program;

    const collected = await collectSchemaArtifacts(program, new Set(["avro"]), [
      createAvroProvider(loadSilentWalk),
    ]);

    expect(collected.refused).toBe(true);
    const reported = diagnosticsWith(program.diagnostics, "avro-artifact-unavailable");
    expect(reported).toHaveLength(1);
    // The sentence stays whole, and it names the walk as the source.
    expect(reported[0]?.message).toContain("refused it: The Avro walk gave no reason.");
    expect(reported[0]?.message).not.toContain("refused it:  ");
  });
});
