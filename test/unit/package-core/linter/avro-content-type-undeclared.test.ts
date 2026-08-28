/**
 * The rule that catches a message which says Avro and carries JSON Schema.
 *
 * The rule reads `preview-features`, and the rule tester cannot carry emitter
 * options: it builds its own compiler options. So every case here runs a
 * normal compilation and enables the rule by id, through the linter helper
 * that both option reading rules share.
 *
 * The Avro decorators are written qualified.
 *
 * Every negative case asserts that its probe compiles before it asserts the
 * silence. A misspelled decorator, or a probe that stopped compiling, reports
 * no rule diagnostic either, so without that guard the case would pass for the
 * wrong reason.
 */

import { describe, expect, it } from "vitest";
import { createOptionsRuleLinter } from "../../../utils/linter.js";

const RULE = "tsp-asyncapi/avro-content-type-undeclared";

const lintWith = createOptionsRuleLinter(RULE, "tsp-avro");

const PROBE = `
  @service(#{ title: "Orders" })
  namespace Test;

  @Avro.avroNamespace("com.example.orders")
  namespace Test.Orders {
    @message
    @contentType("application/vnd.apache.avro")
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

/** The same message, with the decorator the rule asks for. */
const DECLARED = PROBE.replace(
  "@message\n    @contentType",
  "@message\n    @Avro.avroRecord\n    @contentType",
);

/**
 * The same message, with the schema the author wrote by hand.
 *
 * Avro is a JSON based schema language, so the emitter requires the schema as
 * an object value. A string would be rejected before the rule ever runs.
 */
const AUTHORED = PROBE.replace(
  '@contentType("application/vnd.apache.avro")',
  '@contentType("application/vnd.apache.avro")\n    @rawPayload("application/vnd.apache.avro;version=1.9.0", #{ type: "record", name: "OrderPlaced", fields: #[] })',
);

/** A message whose content type says nothing about Avro. */
const JSON_TYPE = PROBE.replace("application/vnd.apache.avro", "application/json");

describe("Unit: the avro-content-type-undeclared rule", () => {
  it("reports an Avro content type with no Avro payload", async () => {
    const found = (await lintWith(PROBE, { "preview-features": ["avro"] })).filter(
      (d) => d.code === RULE,
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("OrderPlaced");
  });

  /**
   * The feature is what makes `@Avro.avroRecord` the answer. Without it the
   * decorator changes nothing, so the advice would send an author to a remedy
   * that does not work yet.
   */
  it("stays quiet when the feature is off", async () => {
    const diagnostics = await lintWith(PROBE, { "preview-features": [] });
    expect(diagnostics.filter((d) => d.severity === "error")).toStrictEqual([]);
    expect(diagnostics.filter((d) => d.code === RULE)).toHaveLength(0);
  });

  it("stays quiet when the model carries the Avro decorator", async () => {
    const diagnostics = await lintWith(DECLARED, { "preview-features": ["avro"] });
    expect(diagnostics.filter((d) => d.severity === "error")).toStrictEqual([]);
    expect(diagnostics.filter((d) => d.code === RULE)).toHaveLength(0);
  });

  /** An author who wrote the schema has already answered the question. */
  it("stays quiet when the author wrote the payload", async () => {
    const diagnostics = await lintWith(AUTHORED, { "preview-features": ["avro"] });
    expect(diagnostics.filter((d) => d.severity === "error")).toStrictEqual([]);
    expect(diagnostics.filter((d) => d.code === RULE)).toHaveLength(0);
  });

  it("stays quiet for a content type that is not Avro", async () => {
    const diagnostics = await lintWith(JSON_TYPE, { "preview-features": ["avro"] });
    expect(diagnostics.filter((d) => d.severity === "error")).toStrictEqual([]);
    expect(diagnostics.filter((d) => d.code === RULE)).toHaveLength(0);
  });

  /**
   * A media type may carry parameters. The rule reads the type and ignores
   * what follows, so a version parameter does not hide the mistake.
   */
  it("reads a media type that carries a parameter", async () => {
    const withParameter = PROBE.replace(
      "application/vnd.apache.avro",
      "application/vnd.apache.avro;version=1.9.0",
    );
    expect(
      (await lintWith(withParameter, { "preview-features": ["avro"] })).filter(
        (d) => d.code === RULE,
      ),
    ).toHaveLength(1);
  });

  /** The JSON and YAML variants name Avro just as the bare type does. */
  it("reads the JSON and YAML variants of the media type", async () => {
    for (const mediaType of [
      "application/vnd.apache.avro+json",
      "application/vnd.apache.avro+yaml",
    ]) {
      const variant = PROBE.replace("application/vnd.apache.avro", mediaType);
      expect(
        (await lintWith(variant, { "preview-features": ["avro"] })).filter((d) => d.code === RULE),
      ).toHaveLength(1);
    }
  });
});
