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
 * `protobuf` has a provider, so asking for it is answered. `avro` is reserved
 * on the same terms and has none, so asking for it is refused. Both cases
 * matter: the option has to turn a feature on, and it has to say so when it
 * cannot.
 *
 * The source below carries no Protobuf decorator. So the provider has nothing
 * to generate for it, which is what makes it the right source for the cases
 * about the option itself.
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
   * The feature that has a provider is accepted. The compilation stays clean
   * and the file is written, which is the whole difference from a name the
   * emitter cannot honor.
   */
  it("accepts a feature that has a provider", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(SOURCE, {
      "preview-features": ["protobuf"],
    });

    expect(diagnosticsWith(diagnostics, "preview-feature-unavailable")).toHaveLength(0);
    expect(doc).not.toBeNull();
  });

  /**
   * Turning the feature on moves nothing on its own. The provider generates a
   * payload for a model that carries the decorators of the other language,
   * and this source carries none.
   */
  it("leaves a document with no Protobuf model unchanged", async () => {
    const withoutOption = await emitDocument(SOURCE);
    const withProtobuf = await emitDocument(SOURCE, { "preview-features": ["protobuf"] });

    expect(withProtobuf).toStrictEqual(withoutOption);
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
   * One available name does not rescue the request. The document would still
   * leave out what the other name asked for, so nothing is written.
   */
  it("refuses the whole request when one of two features is unavailable", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(SOURCE, {
      "preview-features": ["protobuf", "avro"],
    });

    const reported = diagnosticsWith(diagnostics, "preview-feature-unavailable");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.message).toContain("avro");
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
   * Every refused name gets its own diagnostic. One answer for a whole
   * request would leave a project to guess which of its names is the one this
   * release cannot honor.
   *
   * The refusal is called directly, because only one reserved name lacks a
   * provider today. A compilation therefore cannot reach two refusals, and
   * the loop would go unchecked until a second name is reserved.
   */
  it("reports each refused feature once", async () => {
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
