/**
 * The rule that catches a header on a model the Protobuf emitter writes.
 *
 * The rule runs whether or not the preview feature is on, because the
 * `.proto` file comes from the official emitter either way. It steps aside
 * for exactly the properties the emitter already reports an error for, so an
 * author reads one mistake once.
 *
 * Every negative case asserts that its probe compiles before it asserts the
 * silence. A probe that stopped compiling reports no rule diagnostic either,
 * so without that guard the case would pass for the wrong reason.
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

const RULE = "tsp-asyncapi/protobuf-header-on-message";

const Base = createTester(EMITTER_PACKAGE_ROOT, {
  libraries: [PACKAGE_NAME, "@typespec/protobuf"],
})
  .importLibraries()
  .using("AsyncAPI");

/**
 * Compiles one source with the rule on.
 *
 * @param code - The TypeSpec source of the case
 * @param features - What `preview-features` names, or none at all
 * @returns Every diagnostic the compilation reported
 */
async function lint(code: string, features?: string[]): Promise<readonly Diagnostic[]> {
  const tester =
    features === undefined ? Base : Base.emit(PACKAGE_NAME, { "preview-features": features });
  const runner = await tester.createInstance();
  const [, diagnostics] = await runner.compileAndDiagnose(code, {
    compilerOptions: { linterRuleSet: { enable: { [RULE]: true } } },
  });
  return diagnostics;
}

/** A header with no field number. The official emitter refuses this file. */
const BARE = `
  @service(#{ title: "Orders" })
  namespace Test;

  @Protobuf.package({ name: "com.example.orders" })
  namespace Test.Orders {
    @message
    @Protobuf.message
    model OrderPlaced {
      @header traceId: string;
      @Protobuf.field(2) id: string;
    }
  }

  @channel("orders")
  interface C {
    @send
    op place(event: Test.Orders.OrderPlaced): void;
  }
`;

/** The same header, with a field number. The emitter reports an error too. */
const NUMBERED = BARE.replace("@header traceId", "@header @Protobuf.field(1) traceId");

describe("Unit: the protobuf-header-on-message rule", () => {
  it("reports a header with no field number", async () => {
    const found = (await lint(BARE)).filter((one) => one.code === RULE);

    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("traceId");
    expect(found[0]?.message).toContain("@headers");
  });

  it("reports a header that carries a field number", async () => {
    expect((await lint(NUMBERED)).filter((one) => one.code === RULE)).toHaveLength(1);
  });

  /** The `.proto` file comes from the official emitter with the feature off. */
  it("reports with the feature off", async () => {
    expect((await lint(BARE, [])).filter((one) => one.code === RULE)).toHaveLength(1);
  });

  /**
   * With the feature on, a numbered header is already an error. Saying the
   * same thing about the same property would make one mistake read as two.
   */
  it("steps aside for the error the feature reports", async () => {
    const diagnostics = await lint(NUMBERED, ["protobuf"]);

    expect(
      diagnostics.filter((one) => one.code === "tsp-asyncapi/header-with-protobuf-field"),
    ).toHaveLength(1);
    expect(diagnostics.filter((one) => one.code === RULE)).toHaveLength(0);
  });

  /** A bare header is no error, so the rule is the only thing that speaks. */
  it("still reports a bare header with the feature on", async () => {
    expect((await lint(BARE, ["protobuf"])).filter((one) => one.code === RULE)).toHaveLength(1);
  });

  it("stays quiet for a property that is not a header", async () => {
    const diagnostics = await lint(BARE.replace("@header traceId", "@Protobuf.field(1) traceId"));

    expect(diagnostics.filter((one) => one.severity === "error")).toStrictEqual([]);
    expect(diagnostics.filter((one) => one.code === RULE)).toHaveLength(0);
  });

  it("stays quiet when the model carries no @Protobuf.message", async () => {
    const diagnostics = await lint(BARE.replace("    @Protobuf.message\n", ""));

    expect(diagnostics.filter((one) => one.code === RULE)).toHaveLength(0);
  });
});
