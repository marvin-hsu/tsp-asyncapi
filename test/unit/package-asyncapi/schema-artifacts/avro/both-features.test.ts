/**
 * One model, two preview features, no winner.
 *
 * A model can carry the Protobuf decorators and the Avro ones at once, and a
 * project can turn both features on. Then two providers claim the payload of
 * one message, and the emitter has no order between them: the registry lists
 * them in some order, and nothing a project writes states which one wins.
 *
 * So both artifacts are dropped and nothing is written. Keeping one would
 * make the document depend on the order of a list nobody asked about, and
 * writing the document anyway would answer half the request in silence.
 */

import { describe, expect, it } from "vitest";
import { createTester } from "@typespec/compiler/testing";
import { fileURLToPath } from "node:url";
import { PACKAGE_NAME } from "#emitter/lib.js";
import { diagnosticsWith } from "../../../../utils/diagnostics.js";

/** The root of the emitter package, which holds both libraries beside it. */
const PACKAGE_ROOT = fileURLToPath(
  new URL("../../../../../packages/tsp-asyncapi", import.meta.url),
);

/** A tester that compiles all three libraries and turns both features on. */
const BothFeatures = createTester(PACKAGE_ROOT, {
  libraries: [PACKAGE_NAME, "tsp-avro", "@typespec/protobuf"],
})
  .importLibraries()
  .using("AsyncAPI")
  .emit(PACKAGE_NAME, { "preview-features": ["protobuf", "avro"] });

/** One message model both schema languages claim. */
const CLAIMED_TWICE = `
  @service(#{ title: "Orders" })
  namespace Test;

  @Protobuf.package({ name: "com.example.orders" })
  @Avro.avroNamespace("com.example.orders")
  namespace Test.Orders {
    @message
    @Protobuf.message
    @Avro.avroRecord
    model OrderPlaced {
      @Protobuf.field(1)
      orderId: string;
    }
  }

  @channel("orders.placed")
  interface Placed {
    @send
    op placed(event: Test.Orders.OrderPlaced): void;
  }
`;

describe("Unit: one model claimed by two preview features", () => {
  it("reports the conflict and writes nothing", async () => {
    const [result, diagnostics] = await BothFeatures.compileAndDiagnose(CLAIMED_TWICE);

    const reported = diagnosticsWith(diagnostics, "conflicting-generated-schema-source");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");
    // The message names the slot and both providers, so the author knows
    // which two to choose between.
    expect(reported[0]?.message).toContain("payload");
    expect(reported[0]?.message).toContain("protobuf");
    expect(reported[0]?.message).toContain("avro");

    const outputs: Record<string, string | undefined> = result.outputs;
    expect(outputs["asyncapi.yaml"]).toBeUndefined();
  });

  it("honors both features when each one claims a model of its own", async () => {
    const [result, diagnostics] = await BothFeatures.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @Protobuf.package({ name: "com.example.orders" })
      @Avro.avroNamespace("com.example.orders")
      namespace Test.Orders {
        @message
        @Protobuf.message
        model OrderPlaced {
          @Protobuf.field(1)
          orderId: string;
        }

        @message
        @Avro.avroRecord
        model OrderShipped {
          carrier: string;
        }
      }

      @channel("orders.placed")
      interface Placed {
        @send
        op placed(event: Test.Orders.OrderPlaced): void;
      }

      @channel("orders.shipped")
      interface Shipped {
        @send
        op shipped(event: Test.Orders.OrderShipped): void;
      }
    `);

    expect(diagnostics.filter((one) => one.severity === "error")).toEqual([]);
    const outputs: Record<string, string | undefined> = result.outputs;
    const document = outputs["asyncapi.yaml"] ?? "";
    // Each provider answered for its own model, in its own format.
    expect(document).toContain("application/vnd.google.protobuf;version=3");
    expect(document).toContain("application/vnd.apache.avro;version=1.9.0");
  });
});
