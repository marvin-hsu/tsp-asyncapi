/**
 * What a `@header` property does to a generated Protobuf payload.
 *
 * A header travels beside the payload, so the payload must not carry it. The
 * `.proto` file the official emitter writes still declares it, because that
 * emitter knows nothing of AsyncAPI headers and requires a field number on
 * every property. So the two artifacts describe different shapes, and the
 * emitter says so rather than leaving the author to find it.
 *
 * These cases stay out of the parity suite on purpose. Parity compares our
 * descriptor against the official emitter's, and leaving a field out is
 * exactly the difference parity exists to catch.
 */

import { describe, expect, it } from "vitest";
import { createProtobufProvider } from "#emitter/schema-artifacts/protobuf.js";
import { compileWithProtobuf } from "../../../../utils/protobuf-parity.js";

const CONFLICT = `
  @Protobuf.package({ name: "com.example.orders" })
  namespace Orders {
    @message
    @Protobuf.message
    model OrderPlaced {
      @header @Protobuf.field(1) traceId: string;
      @Protobuf.field(2) orderId: string;
    }
  }
`;

describe("Unit: a header that carries a Protobuf field number", () => {
  it("reports the conflict and refuses the payload", async () => {
    const program = await compileWithProtobuf(CONFLICT);
    const collected = await createProtobufProvider().collect(program);

    expect(collected.refused).toBe(true);
    expect(collected.artifacts.payloadFor.size).toBe(0);

    const found = program.diagnostics.filter(
      (one) => one.code === "tsp-asyncapi/header-with-protobuf-field",
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("traceId");
  });

  /**
   * Fixing one property and recompiling to find the next is work the emitter
   * can do at once, so every offending property is named.
   */
  it("names every property that carries both", async () => {
    const both = CONFLICT.replace(
      "@Protobuf.field(2) orderId: string;",
      "@header @Protobuf.field(2) orderId: string;",
    );
    const program = await compileWithProtobuf(both);
    await createProtobufProvider().collect(program);

    const found = program.diagnostics.filter(
      (one) => one.code === "tsp-asyncapi/header-with-protobuf-field",
    );
    expect(found).toHaveLength(2);
  });
});
