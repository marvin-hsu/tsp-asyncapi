import { describe, expect, it } from "vitest";
import { emitDocument, emitDocumentWithDiagnostics } from "../../utils/test-host.js";
import { diagnosticsWith, findDiagnostic } from "../../utils/diagnostics.js";
import { reportUnavailablePreviewFeatures } from "#emitter/preview-features.js";

const SOURCE = `
  @service(#{ title: "Orders" })
  namespace Test;

  @message
  model Placed {
    id: string;
  }

  @channel("orders")
  interface OrderChannel {
    @send
    op place(event: Placed): void;
  }
`;

/**
 * The `preview-features` option, and which of the reserved names work.
 *
 * `protobuf` has a provider and is honored. `avro` is reserved on the same
 * terms and has none, so it is refused: a request the emitter cannot answer
 * must never produce a document.
 *
 * The source below carries no Protobuf decorator. The cases here are about the
 * option itself, not about what a provider generates.
 */
describe("Unit: preview-features", () => {
  /**
   * The default is off. This is the guard the whole preview programme rests
   * on: a document emitted without the option must be the document this
   * emitter emitted before the option existed.
   */
  it("changes nothing when the option is absent", async () => {
    const withoutOption = await emitDocument(SOURCE);
    const withEmptyList = await emitDocument(SOURCE, { "preview-features": [] });

    expect(withEmptyList).toStrictEqual(withoutOption);
  });

  /**
   * `protobuf` has a provider, so the request is honored. A source with no
   * Protobuf decorator gives that provider nothing to answer for, and the
   * document is the one the same source produces with the feature off.
   */
  it("honors protobuf and leaves a source without its decorators alone", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(SOURCE, {
      "preview-features": ["protobuf"],
    });

    expect(diagnosticsWith(diagnostics, "preview-feature-unavailable")).toEqual([]);
    expect(doc).toStrictEqual(await emitDocument(SOURCE));
  });

  /**
   * A reserved name with no provider stops the compile. Accepting it quietly
   * would hand back a document that describes something other than what the
   * project asked for.
   */
  it("reports a reserved feature that has no provider yet", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(SOURCE, {
      "preview-features": ["avro"],
    });

    const reported = findDiagnostic(diagnostics, "preview-feature-unavailable");
    expect(reported.severity).toBe("error");
    // The message has to name the feature and where to remove it from.
    expect(reported.message).toContain("avro");
    expect(reported.message).toContain("preview-features");
  });

  /**
   * The refusal has to reach the output, not only the diagnostic list. A
   * document written next to an error describes something the project did
   * not ask for, and nothing in the file says so. Writing nothing is what
   * makes the error mean what it says.
   */
  it("writes no document when a feature is refused", async () => {
    const { doc } = await emitDocumentWithDiagnostics(SOURCE, {
      "preview-features": ["avro"],
    });

    expect(doc).toBeNull();
  });

  /**
   * One available name and one refused name is still a request the document
   * cannot answer. So the whole request is refused, and only the name with no
   * provider behind it is reported.
   */
  it("refuses the whole request when one of two features has no provider", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(SOURCE, {
      "preview-features": ["protobuf", "avro"],
    });

    const reported = diagnosticsWith(diagnostics, "preview-feature-unavailable");
    expect(reported.map((diagnostic) => diagnostic.message)).toEqual([
      expect.stringContaining("avro"),
    ]);
    expect(doc).toBeNull();
  });

  /**
   * A name outside the reserved set is refused by the option schema, so the
   * compiler answers a typo before the emitter runs. Without the `enum` the
   * line would be accepted and then ignored.
   */
  it("refuses a name outside the reserved set", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(SOURCE, {
      "preview-features": ["protobof"],
    });

    const violation = diagnostics.find((diagnostic) => diagnostic.code === "invalid-schema");
    expect(violation).toBeDefined();
    // The message lists what is allowed, so the author does not have to
    // find the reserved names somewhere else.
    expect(violation?.message).toContain("protobuf, avro");
  });

  /**
   * Two services and a refused feature are two separate answers. The emitter
   * resolves the services before it refuses, so the project hears about both
   * at once instead of one per compile.
   */
  it("reports the extra service as well as the refused feature", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(
      `
        @service(#{ title: "Orders" })
        namespace First {}

        @service(#{ title: "Shipping" })
        namespace Second {}
      `,
      { "preview-features": ["avro"] },
      false,
    );

    expect(diagnosticsWith(diagnostics, "multiple-services")).toHaveLength(1);
    expect(diagnosticsWith(diagnostics, "preview-feature-unavailable")).toHaveLength(1);
    expect(doc).toBeNull();
  });

  /**
   * Every refused name gets its own diagnostic, and an empty registry refuses
   * every name. The refusal is called directly here, so the case reads the
   * registry it is given rather than the one this release ships.
   */
  it("reports each refused feature once against an empty registry", async () => {
    const { program } = await emitDocumentWithDiagnostics(SOURCE);
    const before = program.diagnostics.length;

    const refused = reportUnavailablePreviewFeatures(
      program,
      { "preview-features": ["protobuf", "avro"] },
      new Set(),
    );

    expect(refused).toBe(true);
    const reported = program.diagnostics.slice(before);
    expect(reported.map((diagnostic) => diagnostic.code)).toEqual([
      "tsp-asyncapi/preview-feature-unavailable",
      "tsp-asyncapi/preview-feature-unavailable",
    ]);
    expect(reported[0]?.message).toContain("protobuf");
    expect(reported[1]?.message).toContain("avro");
  });
});
