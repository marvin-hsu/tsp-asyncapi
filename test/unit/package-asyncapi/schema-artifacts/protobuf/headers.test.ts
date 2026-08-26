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
import type { Model } from "@typespec/compiler";
import type { ExternalSchemaArtifact } from "tsp-asyncapi-core";
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

/** The same message, with no field number on the header. */
const LIFTED = `
  @Protobuf.package({ name: "com.example.orders" })
  namespace Orders {
    @message
    @Protobuf.message
    model OrderPlaced {
      @header traceId: string;
      @Protobuf.field(1) orderId: string;
    }
  }
`;

/**
 * Renders the payload of one message of a source.
 *
 * @param source - The TypeSpec source of the case
 * @returns The proto3 text, and every diagnostic code the compile reported
 */
async function renderOne(source: string): Promise<{ text: string; codes: string[] }> {
  const program = await compileWithProtobuf(source);
  const collected = await createProtobufProvider().collect(program);

  expect(collected.refused).toBe(false);
  const payloads: ReadonlyMap<Model, ExternalSchemaArtifact> = collected.artifacts.payloadFor;
  const [artifact] = [...payloads.values()];
  return { text: String(artifact.schema), codes: program.diagnostics.map((one) => one.code) };
}

describe("Unit: a header of a message with a generated Protobuf payload", () => {
  it("leaves the lifted field out of the message", async () => {
    const { text } = await renderOne(LIFTED);

    expect(text).toContain("string orderId = 1;");
    expect(text).not.toContain("traceId");
  });

  /**
   * The type of a header decided whether the payload could be built at all,
   * because the walk demanded a field number for it. A header is not a proto
   * field, so its type has nothing to say about the payload.
   */
  it("builds a payload a header of an unwritable type once refused", async () => {
    const anonymous = LIFTED.replace("@header traceId: string;", "@header trace: { id: string };");
    const { text, codes } = await renderOne(anonymous);

    expect(text).toContain("string orderId = 1;");
    expect(codes.filter((one) => one.startsWith("tsp-asyncapi/"))).toStrictEqual([]);
  });
});
