/**
 * The rule that lists the fields an Avro record leaves out.
 *
 * The walk drops a `@header` property and says nothing, because nothing is
 * wrong: the record and the AsyncAPI payload describe the same fields, and
 * the property is described beside the message. This rule exists for a
 * project that also hands the `.avsc` files to a registry and wants the list.
 *
 * It is not in `recommended`, so every case here enables it by name.
 */

import { describe, expect, it } from "vitest";
import { createTester } from "@typespec/compiler/testing";
import { getDirectoryPath, normalizePath, type Diagnostic } from "@typespec/compiler";
import { fileURLToPath } from "node:url";
import { PACKAGE_NAME } from "#emitter/lib.js";
import { asyncAPILinter } from "#core/linter.js";

const EMITTER_PACKAGE_ROOT = normalizePath(
  getDirectoryPath(
    getDirectoryPath(getDirectoryPath(getDirectoryPath(fileURLToPath(import.meta.url)))),
  ) + "/packages/tsp-asyncapi",
);

const RULE = "tsp-asyncapi/avro-record-drops-header";

const Base = createTester(EMITTER_PACKAGE_ROOT, {
  libraries: [PACKAGE_NAME, "tsp-avro"],
})
  .importLibraries()
  .using("AsyncAPI");

/**
 * Compiles one source, with the rule on unless a case turns it off.
 *
 * @param code - The TypeSpec source of the case
 * @param enable - Whether to enable the rule by name
 * @returns Every diagnostic the compilation reported
 */
async function lint(code: string, enable = true): Promise<readonly Diagnostic[]> {
  const runner = await Base.createInstance();
  const [, diagnostics] = await runner.compileAndDiagnose(code, {
    compilerOptions: enable ? { linterRuleSet: { enable: { [RULE]: true } } } : {},
  });
  return diagnostics;
}

const LIFTED = `
  @service(#{ title: "Orders" })
  namespace Test;

  @Avro.avroNamespace("com.example.orders")
  namespace Test.Orders {
    @message
    @Avro.avroRecord
    model OrderPlaced {
      @header traceId: string;
      orderId: string;
    }
  }

  @channel("orders")
  interface C {
    @send
    op place(event: Test.Orders.OrderPlaced): void;
  }
`;

describe("Unit: the avro-record-drops-header rule", () => {
  it("names the property the record leaves out", async () => {
    const found = (await lint(LIFTED)).filter((one) => one.code === RULE);

    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("traceId");
  });

  /**
   * An author who writes `@header` means "not in the payload". Naming that as
   * a mistake on every compile is why the rule is opt in.
   */
  it("stays quiet unless a project asks for it", async () => {
    const diagnostics = await lint(LIFTED, false);

    expect(diagnostics.filter((one) => one.severity === "error")).toStrictEqual([]);
    expect(diagnostics.filter((one) => one.code === RULE)).toHaveLength(0);
  });

  it("is not in the recommended rule set", () => {
    const recommended = Object.keys(asyncAPILinter.ruleSets?.recommended.enable ?? {});

    expect(recommended).not.toContain(RULE);
  });

  /** Without the Avro decorator there is no record to leave anything out of. */
  it("stays quiet when the model carries no @Avro.avroRecord", async () => {
    const diagnostics = await lint(LIFTED.replace("    @Avro.avroRecord\n", ""));

    expect(diagnostics.filter((one) => one.severity === "error")).toStrictEqual([]);
    expect(diagnostics.filter((one) => one.code === RULE)).toHaveLength(0);
  });

  /** `@headers` points at a model of its own, so nothing leaves the record. */
  it("stays quiet when the headers are a model of their own", async () => {
    const withModel = LIFTED.replace(
      "    @message\n    @Avro.avroRecord",
      "    @message\n    @headers(Meta)\n    @Avro.avroRecord",
    )
      .replace("@header traceId: string;\n", "")
      .replace(
        "  namespace Test.Orders {",
        "  namespace Test.Orders {\n    model Meta {\n      traceId: string;\n    }\n",
      );
    const diagnostics = await lint(withModel);

    expect(diagnostics.filter((one) => one.severity === "error")).toStrictEqual([]);
    expect(diagnostics.filter((one) => one.code === RULE)).toHaveLength(0);
  });
});
