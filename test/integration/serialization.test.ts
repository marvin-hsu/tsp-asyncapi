import { describe, it, expect } from "vitest";
import { expectDiagnosticEmpty } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing/index.js";
import { PACKAGE_NAME } from "#emitter/lib.js";

/**
 * The YAML serialization rules that only the raw text can show.
 *
 * The other integration suites parse the output before asserting on it, and
 * a parser hides exactly what these cases protect: where a line ends. The
 * output-baseline suite pins whole files, but every baseline program keeps
 * its lines short, so the wrapping rule never comes up there.
 */

/**
 * Compiles one program and returns the file the emitter wrote.
 *
 * @param code - The whole of `main.tsp`, service namespace included
 * @returns The text of the emitted file
 */
async function emitRaw(code: string): Promise<string> {
  const [result, diagnostics] = await AsyncAPITester.emit(PACKAGE_NAME).compileAndDiagnose(code);
  expectDiagnosticEmpty(diagnostics);
  const outputs: Record<string, string | undefined> = result.outputs;
  const content = outputs["asyncapi.yaml"];
  if (content === undefined) {
    throw new Error("The emitter wrote no asyncapi.yaml");
  }
  return content;
}

describe("Integration: YAML serialization", () => {
  it("keeps a $ref longer than 80 columns on one line", async () => {
    // The default `yaml` line width of 80 folds a long scalar across two
    // lines. A folded `$ref` is legal YAML, but a plain-text search for the
    // pointer no longer finds it. The channel id and message name here are
    // sized so the composed `$ref` passes 80 columns, indentation included.
    const code = `
      @service(#{ title: "Clearing Events" })
      namespace Clearing;

      @message
      model TchPaymentConfirmNotification {
        id: string;
      }

      @channel("rd1_taiwan_clearing_house_payment_confirm")
      interface PaymentConfirm {
        @send op publish(body: TchPaymentConfirmNotification): void;
      }
    `;
    const content = await emitRaw(code);

    const ref =
      "#/channels/rd1_taiwan_clearing_house_payment_confirm/messages/TchPaymentConfirmNotification";
    // The whole pointer sits on a single line, quotes closed.
    expect(content).toMatch(new RegExp(`^\\s*- \\$ref: "${ref}"$`, "m"));
    // And no line anywhere carries a folded half of a pointer: every line
    // that mentions `$ref` also holds the fragment marker its value starts
    // with.
    //
    // The count is asserted afterwards. A document that emitted no `$ref` at
    // all would run this loop zero times, and the claim would hold without
    // ever looking at a pointer.
    let refLines = 0;
    for (const line of content.split("\n")) {
      if (line.includes("$ref")) {
        refLines++;
        expect(line).toContain("#/");
      }
    }
    expect(refLines).toBeGreaterThan(0);
  });
});
