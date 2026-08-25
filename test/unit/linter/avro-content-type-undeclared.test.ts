/**
 * The rule that catches a message which says Avro and carries JSON Schema.
 *
 * The rule reads `preview-features`, and the rule tester cannot carry emitter
 * options: it builds its own compiler options. So every case here runs a
 * normal compilation and enables the rule by id through `linterRuleSet`.
 *
 * The Avro decorators are written qualified, and `record` and `namespace` are
 * TypeSpec keywords, so they carry backticks as well.
 */

import { describe, expect, it } from "vitest";
import { createTester } from "@typespec/compiler/testing";
import { getDirectoryPath, normalizePath, type Diagnostic } from "@typespec/compiler";
import { fileURLToPath } from "node:url";
import { PACKAGE_NAME } from "#emitter/lib.js";

const EMITTER_PACKAGE_ROOT = normalizePath(
  getDirectoryPath(
    getDirectoryPath(getDirectoryPath(getDirectoryPath(fileURLToPath(import.meta.url)))),
  ) + "/packages/tsp-asyncapi",
);

const RULE = "tsp-asyncapi/avro-content-type-undeclared";

const Base = createTester(EMITTER_PACKAGE_ROOT, {
  libraries: [PACKAGE_NAME, "tsp-avro"],
})
  .importLibraries()
  .using("AsyncAPI");

async function lint(code: string, features: string[]): Promise<readonly Diagnostic[]> {
  const runner = await Base.emit(PACKAGE_NAME, { "preview-features": features }).createInstance();
  const [, diagnostics] = await runner.compileAndDiagnose(code, {
    compilerOptions: { linterRuleSet: { enable: { [RULE]: true } } },
  });
  return diagnostics;
}

const PROBE = `
  @service(#{ title: "Orders" })
  namespace Test;

  @Avro.\`namespace\`("com.example.orders")
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
  "@message\n    @Avro.`record`\n    @contentType",
);

/** The same message, with the schema the author wrote by hand. */
const AUTHORED = PROBE.replace(
  '@contentType("application/vnd.apache.avro")',
  '@contentType("application/vnd.apache.avro")\n    @rawPayload("application/vnd.apache.avro;version=1.9.0", "{}")',
);

/** A message whose content type says nothing about Avro. */
const JSON_TYPE = PROBE.replace("application/vnd.apache.avro", "application/json");

describe("Unit: the avro-content-type-undeclared rule", () => {
  it("reports an Avro content type with no Avro payload", async () => {
    const found = (await lint(PROBE, ["avro"])).filter((d) => d.code === RULE);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("OrderPlaced");
  });

  /**
   * The feature is what makes `@Avro.record` the answer. Without it the
   * decorator changes nothing, so the advice would send an author to a remedy
   * that does not work yet.
   */
  it("stays quiet when the feature is off", async () => {
    expect((await lint(PROBE, [])).filter((d) => d.code === RULE)).toHaveLength(0);
  });

  it("stays quiet when the model carries the Avro decorator", async () => {
    const diagnostics = await lint(DECLARED, ["avro"]);
    // A misspelled decorator would silence the rule as well, so the case also
    // asserts that the probe compiles.
    expect(diagnostics.filter((d) => d.severity === "error")).toStrictEqual([]);
    expect(diagnostics.filter((d) => d.code === RULE)).toHaveLength(0);
  });

  /** An author who wrote the schema has already answered the question. */
  it("stays quiet when the author wrote the payload", async () => {
    expect((await lint(AUTHORED, ["avro"])).filter((d) => d.code === RULE)).toHaveLength(0);
  });

  it("stays quiet for a content type that is not Avro", async () => {
    expect((await lint(JSON_TYPE, ["avro"])).filter((d) => d.code === RULE)).toHaveLength(0);
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
    expect((await lint(withParameter, ["avro"])).filter((d) => d.code === RULE)).toHaveLength(1);
  });

  /** The JSON and YAML variants name Avro just as the bare type does. */
  it("reads the JSON and YAML variants of the media type", async () => {
    for (const mediaType of [
      "application/vnd.apache.avro+json",
      "application/vnd.apache.avro+yaml",
    ]) {
      const variant = PROBE.replace("application/vnd.apache.avro", mediaType);
      expect((await lint(variant, ["avro"])).filter((d) => d.code === RULE)).toHaveLength(1);
    }
  });
});
