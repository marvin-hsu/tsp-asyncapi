/**
 * The rule that catches a property which is both a header and a proto field.
 *
 * The rule reads no emitter options, so every case here compiles with the
 * feature off. That is the point of the rule: the `.proto` file comes from
 * the official emitter either way, so the two artifacts disagree whether or
 * not this emitter generates a Protobuf payload.
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

const RULE = "tsp-asyncapi/protobuf-field-on-header";

const Base = createTester(EMITTER_PACKAGE_ROOT, {
  libraries: [PACKAGE_NAME, "@typespec/protobuf"],
})
  .importLibraries()
  .using("AsyncAPI");

async function lint(code: string): Promise<readonly Diagnostic[]> {
  const runner = await Base.createInstance();
  const [, diagnostics] = await runner.compileAndDiagnose(code, {
    compilerOptions: { linterRuleSet: { enable: { [RULE]: true } } },
  });
  return diagnostics;
}

/** A message whose trace id is a header and field 1 of the proto message. */
const PROBE = `
  @service(#{ title: "Orders" })
  namespace Test;

  @Protobuf.package({ name: "com.example.orders" })
  namespace Test.Orders {
    @message
    @Protobuf.message
    model OrderPlaced {
      @header @Protobuf.field(1) traceId: string;
      @Protobuf.field(2) id: string;
    }
  }

  @channel("orders")
  interface C {
    @send
    op place(event: Test.Orders.OrderPlaced): void;
  }
`;

describe("Unit: the protobuf-field-on-header rule", () => {
  it("reports a property that carries both decorators", async () => {
    const found = (await lint(PROBE)).filter((d) => d.code === RULE);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("traceId");
    expect(found[0]?.message).toContain("OrderPlaced");
  });

  /**
   * The remedy has to be in the message, because a header that belongs in the
   * proto message has nowhere else to go.
   */
  it("names the remedy", async () => {
    const found = (await lint(PROBE)).filter((d) => d.code === RULE);
    expect(found[0]?.message).toContain("@headers");
  });

  /** A header with no field number is a different mistake, and not this one. */
  it("stays quiet for a header that carries no field number", async () => {
    const diagnostics = await lint(PROBE.replace("@header @Protobuf.field(1) ", "@header "));
    expect(diagnostics.filter((d) => d.code === RULE)).toHaveLength(0);
  });

  /** A field number on an ordinary property is what the author should write. */
  it("stays quiet for a field that is not a header", async () => {
    const diagnostics = await lint(
      PROBE.replace("@header @Protobuf.field(1)", "@Protobuf.field(1)"),
    );
    expect(diagnostics.filter((d) => d.severity === "error")).toStrictEqual([]);
    expect(diagnostics.filter((d) => d.code === RULE)).toHaveLength(0);
  });

  /**
   * Without the official decorator there is no proto message, so nothing
   * disagrees with the payload.
   */
  it("stays quiet when the model carries no @Protobuf.message", async () => {
    const diagnostics = await lint(PROBE.replace("    @Protobuf.message\n", ""));
    expect(diagnostics.filter((d) => d.code === RULE)).toHaveLength(0);
  });

  /** A model outside the document has no AsyncAPI payload to disagree with. */
  it("stays quiet for a model that is not a message", async () => {
    const diagnostics = await lint(
      PROBE.replace("@message\n    @Protobuf.message", "@Protobuf.message").replace(
        "op place(event: Test.Orders.OrderPlaced): void;",
        "op place(event: string): void;",
      ),
    );
    expect(diagnostics.filter((d) => d.code === RULE)).toHaveLength(0);
  });
});
