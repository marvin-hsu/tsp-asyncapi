import { describe, it, expect, beforeEach } from "vitest";
import { listServices, Model, Program } from "@typespec/compiler";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing.js";
import { buildAsyncAPIDocument } from "#emitter/pipeline.js";
import {
  collectSchemaArtifacts,
  type SchemaArtifactProvider,
} from "#emitter/schema-artifacts/provider.js";
import type { ExternalSchemaArtifact } from "tsp-asyncapi-core";
import { namespaceOf } from "../../../utils/namespace.js";
import { diagnosticsWith } from "../../../utils/diagnostics.js";

/** The Protobuf format identifier AsyncAPI recommends. */
const PROTOBUF = "application/vnd.google.protobuf;version=3";

/** One source, used by every case, with one message model in it. */
const SOURCE = `
  @service(#{ title: "Orders" })
  namespace Test;

  @message
  model OrderCreated {
    orderId: string;
  }
`;

/** The model every provider below claims. */
function messageModel(program: Program): Model {
  const model = namespaceOf(program, "Test").models.get("OrderCreated");
  if (model === undefined) throw new Error("The test source declares no model 'OrderCreated'.");
  return model;
}

/** An artifact one provider produced for one model. */
function artifactOf(provider: string): ExternalSchemaArtifact {
  return {
    schemaFormat: PROTOBUF,
    schema: `syntax = "proto3";\npackage com.example.${provider};`,
    provider,
    identity: `com.example.${provider}`,
  };
}

/**
 * A provider that answers with what the test handed it.
 *
 * No external tool runs here. What this proves is the seam: an index built
 * outside the pipeline reaches the payload of a message, and two indexes that
 * disagree are reported rather than resolved by order.
 */
function fakeProvider(
  id: SchemaArtifactProvider["id"],
  slot: "payload" | "headers",
  model: Model,
): SchemaArtifactProvider {
  const claimed = new Map([[model, artifactOf(id)]]);
  return {
    id,
    collect: () =>
      Promise.resolve({
        artifacts: {
          payloadFor: slot === "payload" ? claimed : new Map(),
          headersFor: slot === "headers" ? claimed : new Map(),
        },
        refused: false,
      }),
  };
}

describe("Unit: Schema artifact providers (Phase 16 P1)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("turns an artifact into the raw payload of the message", async () => {
    await runner.compileAndDiagnose(SOURCE);
    const program = runner.program;

    const { artifacts, refused } = await collectSchemaArtifacts(program, new Set(["protobuf"]), [
      fakeProvider("protobuf", "payload", messageModel(program)),
    ]);
    const doc = await buildAsyncAPIDocument(program, listServices(program)[0], {}, artifacts);

    expect(refused).toBe(false);
    expect(doc.components?.messages?.OrderCreated.payload).toEqual({
      schemaFormat: PROTOBUF,
      schema: 'syntax = "proto3";\npackage com.example.protobuf;',
    });
    // The model produced no schema of its own, because nothing was built from
    // it. A payload built from the model would leave a declaration here.
    expect(doc.components?.schemas).toBeUndefined();
  });

  it("keeps a payload the author wrote over one a provider generated", async () => {
    await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${PROTOBUF}", "syntax = \\"proto3\\";")
      model OrderCreated {
        orderId: string;
      }
    `);
    const program = runner.program;

    const { artifacts } = await collectSchemaArtifacts(program, new Set(["protobuf"]), [
      fakeProvider("protobuf", "payload", messageModel(program)),
    ]);
    const doc = await buildAsyncAPIDocument(program, listServices(program)[0], {}, artifacts);

    expect(doc.components?.messages?.OrderCreated.payload).toEqual({
      schemaFormat: PROTOBUF,
      schema: 'syntax = "proto3";',
    });

    // The generated schema left the document. The author is told, so the
    // choice between the two is theirs rather than the emitter's.
    const reported = diagnosticsWith(program.diagnostics, "conflicting-message-schema-source");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("warning");
    expect(reported[0]?.message).toContain("protobuf");
  });

  it("builds the schema from the model when no feature is on", async () => {
    await runner.compileAndDiagnose(SOURCE);
    const program = runner.program;

    // The provider is in the registry the call is given, and the feature that
    // turns it on is not requested. So it never runs.
    const { artifacts } = await collectSchemaArtifacts(program, new Set(), [
      fakeProvider("protobuf", "payload", messageModel(program)),
    ]);
    const doc = await buildAsyncAPIDocument(program, listServices(program)[0], {}, artifacts);

    expect(artifacts.payloadFor.size).toBe(0);
    expect(doc.components?.messages?.OrderCreated.payload).toEqual({
      $ref: "#/components/schemas/OrderCreated",
    });
  });

  it("runs no provider when the registry is empty", async () => {
    await runner.compileAndDiagnose(SOURCE);
    const program = runner.program;

    // This is what the emitter does today: the shipped registry holds no
    // provider, so a requested feature reaches nothing here.
    const { artifacts } = await collectSchemaArtifacts(program, new Set(["protobuf"]), []);

    expect(artifacts.payloadFor.size).toBe(0);
    expect(artifacts.headersFor.size).toBe(0);
  });

  it("reports two providers that claim one payload, and lets neither win", async () => {
    await runner.compileAndDiagnose(SOURCE);
    const program = runner.program;
    const model = messageModel(program);

    const { artifacts, refused } = await collectSchemaArtifacts(
      program,
      new Set(["protobuf", "avro"]),
      [fakeProvider("protobuf", "payload", model), fakeProvider("avro", "payload", model)],
    );

    const reported = diagnosticsWith(program.diagnostics, "conflicting-generated-schema-source");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");
    // The caller is told, so it can write nothing. The diagnostic alone does
    // not stop the emitter from writing the file.
    expect(refused).toBe(true);
    expect(reported[0]?.message).toContain("payload");
    expect(reported[0]?.message).toContain("protobuf");
    expect(reported[0]?.message).toContain("avro");

    // Neither artifact survives. Keeping the first would make the winner the
    // order of the registry, which no project states.
    expect(artifacts.payloadFor.size).toBe(0);
    const doc = await buildAsyncAPIDocument(program, listServices(program)[0], {}, artifacts);
    expect(doc.components?.messages?.OrderCreated.payload).toEqual({
      $ref: "#/components/schemas/OrderCreated",
    });
  });

  it("does not decide the payload conflict by the order the providers run", async () => {
    await runner.compileAndDiagnose(SOURCE);
    const program = runner.program;
    const model = messageModel(program);

    const { artifacts } = await collectSchemaArtifacts(program, new Set(["protobuf", "avro"]), [
      fakeProvider("avro", "payload", model),
      fakeProvider("protobuf", "payload", model),
    ]);

    expect(artifacts.payloadFor.size).toBe(0);
    expect(
      diagnosticsWith(program.diagnostics, "conflicting-generated-schema-source"),
    ).toHaveLength(1);
  });

  it("reports a conflict in the headers slot as its own", async () => {
    await runner.compileAndDiagnose(SOURCE);
    const program = runner.program;
    const model = messageModel(program);

    const { artifacts, refused } = await collectSchemaArtifacts(
      program,
      new Set(["protobuf", "avro"]),
      [fakeProvider("protobuf", "headers", model), fakeProvider("avro", "headers", model)],
    );

    const reported = diagnosticsWith(program.diagnostics, "conflicting-generated-schema-source");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.message).toContain("headers");
    expect(artifacts.headersFor.size).toBe(0);
    expect(refused).toBe(true);
  });

  it("keeps the artifacts of two providers that claim different slots", async () => {
    await runner.compileAndDiagnose(SOURCE);
    const program = runner.program;
    const model = messageModel(program);

    const { artifacts } = await collectSchemaArtifacts(program, new Set(["protobuf", "avro"]), [
      fakeProvider("protobuf", "payload", model),
      fakeProvider("avro", "headers", model),
    ]);

    expect(
      diagnosticsWith(program.diagnostics, "conflicting-generated-schema-source"),
    ).toHaveLength(0);
    expect(artifacts.payloadFor.get(model)?.provider).toBe("protobuf");
    expect(artifacts.headersFor.get(model)?.provider).toBe("avro");
  });
});
