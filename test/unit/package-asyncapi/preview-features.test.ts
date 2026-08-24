import { describe, expect, it } from "vitest";
import { emitDocument, emitDocumentWithDiagnostics } from "../../utils/test-host.js";
import { diagnosticsWith, findDiagnostic } from "../../utils/diagnostics.js";

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
 * The `preview-features` option, and what happens to a feature this release
 * cannot do yet.
 *
 * Both reserved names are refused in this release. The option exists first,
 * and a provider fills it in later, so the case a project meets today is the
 * one where the name is known and the provider is not there.
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
   * A reserved name with no provider stops the compile. Accepting it quietly
   * would hand back a document that describes something other than what the
   * project asked for.
   */
  it("reports a reserved feature that has no provider yet", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(SOURCE, {
      "preview-features": ["protobuf"],
    });

    const reported = findDiagnostic(diagnostics, "preview-feature-unavailable");
    expect(reported.severity).toBe("error");
    // The message has to name the feature and where to remove it from.
    expect(reported.message).toContain("protobuf");
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
      "preview-features": ["protobuf"],
    });

    expect(doc).toBeNull();
  });

  /** `avro` is reserved on the same terms, and refused the same way. */
  it("reports avro as reserved and unavailable", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(SOURCE, {
      "preview-features": ["avro"],
    });

    expect(findDiagnostic(diagnostics, "preview-feature-unavailable").message).toContain("avro");
  });

  /** Two unavailable features are two reports, not one for the pair. */
  it("reports each unavailable feature once", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(SOURCE, {
      "preview-features": ["protobuf", "avro"],
    });

    expect(diagnosticsWith(diagnostics, "preview-feature-unavailable")).toHaveLength(2);
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
});
