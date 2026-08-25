import { describe, expect, it } from "vitest";
import { emitDocument, emitDocumentWithDiagnostics } from "../../utils/test-host.js";
import { diagnosticsWith } from "../../utils/diagnostics.js";
import { reportUnavailablePreviewFeatures } from "#emitter/preview-features.js";
import { availableFeatures, shippedProviders } from "#emitter/schema-artifacts/provider.js";

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
 * Both reserved names have a provider in this release, so the shipped
 * registry refuses neither. What the option still has to answer for is a name
 * no registry holds: such a request cannot be answered, and it must never
 * produce a document. Those cases call the refusal directly, against a
 * registry they state, rather than against the one this release ships.
 *
 * The source below carries no Protobuf and no Avro decorator. The cases here
 * are about the option itself, not about what a provider generates.
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
   * `avro` has a provider too. A source with no Avro decorator gives it
   * nothing to answer for, and the document is the one the same source
   * produces with the feature off.
   */
  it("honors avro and leaves a source without its decorators alone", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(SOURCE, {
      "preview-features": ["avro"],
    });

    expect(diagnosticsWith(diagnostics, "preview-feature-unavailable")).toEqual([]);
    expect(doc).toStrictEqual(await emitDocument(SOURCE));
  });

  /**
   * The registry decides which names are available, and the option decides
   * which names a project may write. The two sets have to be the same one: a
   * name the option accepts and the registry does not answer is refused after
   * the project already wrote it.
   */
  it("answers every reserved name with a provider", () => {
    expect([...availableFeatures(shippedProviders())].sort((a, b) => a.localeCompare(b))).toEqual([
      "avro",
      "protobuf",
    ]);
  });

  /**
   * A name no registry holds stops the compile. Accepting it quietly would
   * hand back a document that describes something other than what the project
   * asked for.
   *
   * The registry is stated here, because the shipped one answers every
   * reserved name. What is under test is the refusal, not which names this
   * release happens to ship.
   */
  it("reports a feature the registry does not answer", async () => {
    const { program } = await emitDocumentWithDiagnostics(SOURCE);
    const before = program.diagnostics.length;

    const refused = reportUnavailablePreviewFeatures(
      program,
      { "preview-features": ["avro"] },
      new Set(["protobuf"]),
    );

    expect(refused).toBe(true);
    const reported = program.diagnostics.slice(before);
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");
    // The message has to name the feature and where to remove it from.
    expect(reported[0]?.message).toContain("avro");
    expect(reported[0]?.message).toContain("preview-features");
  });

  /**
   * One available name and one unanswered name is still a request the
   * document cannot answer. So the whole request is refused, and only the
   * name with no provider behind it is reported.
   *
   * The emitter writes nothing on that answer. Two other cases prove the
   * writing half, one per provider: a model a provider cannot answer for
   * leaves the emitter with no document to write.
   */
  it("refuses the whole request when one of two features has no provider", async () => {
    const { program } = await emitDocumentWithDiagnostics(SOURCE);
    const before = program.diagnostics.length;

    const refused = reportUnavailablePreviewFeatures(
      program,
      { "preview-features": ["protobuf", "avro"] },
      new Set(["protobuf"]),
    );

    expect(refused).toBe(true);
    const reported = program.diagnostics.slice(before);
    expect(reported.map((diagnostic) => diagnostic.message)).toEqual([
      expect.stringContaining("avro"),
    ]);
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
