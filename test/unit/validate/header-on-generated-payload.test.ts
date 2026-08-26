/**
 * A `@header` on a model that declares a Protobuf message or an Avro record.
 *
 * Neither target language can describe a property its payload does not carry.
 * So the combination is refused, and the author is sent to `@headers`, which
 * both languages describe without difficulty.
 *
 * The check runs in `$onValidate`, so it does not wait for an emitter. Every
 * case here compiles with no emitter at all, which is what proves that.
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

const CODE = "tsp-asyncapi/header-on-generated-payload";

const Base = createTester(EMITTER_PACKAGE_ROOT, {
  libraries: [PACKAGE_NAME, "@typespec/protobuf", "tsp-avro"],
})
  .importLibraries()
  .using("AsyncAPI");

/**
 * Compiles one source with no emitter and returns what it reported.
 *
 * @param code - The TypeSpec source of the case
 * @returns Every diagnostic the compilation reported
 */
async function check(code: string): Promise<readonly Diagnostic[]> {
  const runner = await Base.createInstance();
  const [, diagnostics] = await runner.compileAndDiagnose(code);
  return diagnostics;
}

const PROTOBUF = `
  @service(#{ title: "Orders" })
  namespace Test;

  @Protobuf.package({ name: "com.example.orders" })
  namespace Test.Orders {
    @message
    @Protobuf.message
    model OrderPlaced {
      @header traceId: string;
      @Protobuf.field(2) orderId: string;
    }
  }
`;

const AVRO = `
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
`;

describe("Unit: a header on a model with a generated payload", () => {
  it.each([
    ["Protobuf", PROTOBUF, "@Protobuf.message"],
    ["Avro", AVRO, "@Avro.avroRecord"],
  ])("refuses a %s message that lifts a field", async (_name, source, decorator) => {
    const found = (await check(source)).filter((one) => one.code === CODE);

    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe("error");
    expect(found[0]?.message).toContain("traceId");
    expect(found[0]?.message).toContain(decorator);
    expect(found[0]?.message).toContain("@headers");
  });

  /** Fixing one and compiling again to find the next is a wasted round trip. */
  it("names every property that is marked", async () => {
    const both = PROTOBUF.replace(
      "@Protobuf.field(2) orderId: string;",
      "@header @Protobuf.field(2) orderId: string;",
    );

    expect((await check(both)).filter((one) => one.code === CODE)).toHaveLength(2);
  });

  /**
   * The remedy has to compile. A case that only asserts the error would pass
   * while sending the author somewhere that does not work.
   */
  it("accepts the remedy it names", async () => {
    const withModel = AVRO.replace(
      "    @message\n    @Avro.avroRecord",
      "    model Meta {\n      traceId: string;\n    }\n\n    @message\n    @headers(Meta)\n    @Avro.avroRecord",
    ).replace("      @header traceId: string;\n", "");
    const diagnostics = await check(withModel);

    expect(diagnostics.filter((one) => one.severity === "error")).toStrictEqual([]);
    expect(diagnostics.filter((one) => one.code === CODE)).toHaveLength(0);
  });

  /** A plain message has no generated payload, so a header is fine there. */
  it("accepts a header on a message with no binary schema", async () => {
    const plain = AVRO.replace("    @Avro.avroRecord\n", "");
    const diagnostics = await check(plain);

    expect(diagnostics.filter((one) => one.severity === "error")).toStrictEqual([]);
    expect(diagnostics.filter((one) => one.code === CODE)).toHaveLength(0);
  });

  /**
   * A mark on a model reached from a message is on something that is not a
   * message. The emitter reports that separately and leaves the property
   * where it is, so this check must not fire for it as well.
   */
  it("accepts a mark on a nested model", async () => {
    const nested = `
      @service(#{ title: "Orders" })
      namespace Test;

      @Avro.avroNamespace("com.example.orders")
      namespace Test.Orders {
        model Detail {
          @header note: string;
          amount: int64;
        }

        @message
        @Avro.avroRecord
        model OrderPlaced {
          orderId: string;
          detail: Detail;
        }
      }
    `;

    expect((await check(nested)).filter((one) => one.code === CODE)).toHaveLength(0);
  });
});
