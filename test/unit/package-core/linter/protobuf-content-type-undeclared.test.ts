import { describe, expect, it } from "vitest";
import { createOptionsRuleLinter } from "../../../utils/linter.js";

const RULE = "tsp-asyncapi/protobuf-content-type-undeclared";

const lintWith = createOptionsRuleLinter(RULE, "@typespec/protobuf");

const PROBE = `
  @service(#{ title: "Orders" })
  namespace Test;

  @Protobuf.package({ name: "com.example.orders" })
  namespace Test.Orders {
    @message
    @contentType("application/vnd.google.protobuf")
    model OrderPlaced {
      id: string;
    }
  }

  @channel("orders")
  interface C {
    @send
    op place(event: Test.Orders.OrderPlaced): void;
  }
`;

/** The same message, with the official decorators the rule asks for. */
const DECLARED = PROBE.replace(
  "@message\n    @contentType",
  "@message\n    @Protobuf.message\n    @contentType",
).replace("id: string;", "@Protobuf.field(1) id: string;");

/** The same message, with the schema the author wrote by hand. */
const AUTHORED = PROBE.replace(
  '@contentType("application/vnd.google.protobuf")',
  '@contentType("application/vnd.google.protobuf")\n    @rawPayload("application/vnd.google.protobuf;version=3", "syntax = \\"proto3\\"; message OrderPlaced { string id = 1; }")',
);

/** A message whose content type says nothing about Protobuf. */
const JSON_TYPE = PROBE.replace("application/vnd.google.protobuf", "application/json");

describe("Unit: the protobuf-content-type-undeclared rule", () => {
  it("reports a Protobuf content type with no Protobuf payload", async () => {
    const found = (await lintWith(PROBE, { "preview-features": ["protobuf"] })).filter(
      (d) => d.code === RULE,
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("OrderPlaced");
  });

  /**
   * The feature is what makes `@Protobuf.message` the answer. Without it the
   * decorators change nothing, so the advice would send an author to a
   * remedy that does not work yet.
   */
  it("stays quiet when the feature is off", async () => {
    const diagnostics = await lintWith(PROBE, { "preview-features": [] });
    expect(diagnostics.filter((d) => d.severity === "error")).toStrictEqual([]);
    expect(diagnostics.filter((d) => d.code === RULE)).toHaveLength(0);
  });

  it("stays quiet when the model carries the official decorators", async () => {
    const diagnostics = await lintWith(DECLARED, { "preview-features": ["protobuf"] });
    expect(diagnostics.filter((d) => d.severity === "error")).toStrictEqual([]);
    expect(diagnostics.filter((d) => d.code === RULE)).toHaveLength(0);
  });

  /** An author who wrote the schema has already answered the question. */
  it("stays quiet when the author wrote the payload", async () => {
    const diagnostics = await lintWith(AUTHORED, { "preview-features": ["protobuf"] });
    expect(diagnostics.filter((d) => d.severity === "error")).toStrictEqual([]);
    expect(diagnostics.filter((d) => d.code === RULE)).toHaveLength(0);
  });

  it("stays quiet for a content type that is not Protobuf", async () => {
    const diagnostics = await lintWith(JSON_TYPE, { "preview-features": ["protobuf"] });
    expect(diagnostics.filter((d) => d.severity === "error")).toStrictEqual([]);
    expect(diagnostics.filter((d) => d.code === RULE)).toHaveLength(0);
  });

  /**
   * A media type may carry parameters. The rule reads the type and ignores
   * what follows, so a version parameter does not hide the mistake.
   */
  it("reads a media type that carries a parameter", async () => {
    const withParameter = PROBE.replace(
      "application/vnd.google.protobuf",
      "application/vnd.google.protobuf;version=3",
    );
    expect(
      (await lintWith(withParameter, { "preview-features": ["protobuf"] })).filter(
        (d) => d.code === RULE,
      ),
    ).toHaveLength(1);
  });
});
