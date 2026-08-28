/**
 * The Protobuf provider, as the registry holds it.
 *
 * This file joins existing parts over a whole program. The state reader
 * says which models the official decorators marked and which package each
 * belongs to. The walk builds one model's closure, and the printer renders
 * that closure as proto3 text. One model is one payload, carrying the
 * message the model names plus every declaration it reaches; two messages
 * of one package get two separate texts. A text's root is the message its
 * payload was built for. A Protobuf reader finds that root as the
 * declaration nothing else references, unless two messages reference each
 * other.
 *
 * A payload is built only for a model the document asks about, one that
 * also carries `@AsyncAPI.message`. A model this cannot answer for is a
 * refusal. The caller stops on one rather than falling back to the plain
 * JSON Schema its TypeSpec type would otherwise produce.
 */

import type { Model, Program } from "@typespec/compiler";
import { listMessages, type ExternalSchemaArtifact } from "tsp-asyncapi-core";
import { buildPayloadModel } from "./protobuf/model.js";
import { renderProtoFile } from "./protobuf/render.js";
import { listProtobufMessageModels } from "tsp-asyncapi-core/unstable";
import type { CollectedSchemaArtifacts, SchemaArtifactProvider } from "./provider.js";

/**
 * The AsyncAPI schema format of proto3 text.
 *
 * The AsyncAPI specification lists this string, together with the media type
 * it builds on, for a Protobuf schema.
 */
const PROTOBUF_SCHEMA_FORMAT = "application/vnd.google.protobuf;version=3";

/** The name of the provider, as a diagnostic and a test read it. */
const PROVIDER_ID = "protobuf";

/**
 * Builds the provider that answers the `protobuf` preview feature.
 *
 * Returns a fresh provider per call, since nothing in it holds state
 * between emits.
 *
 * @internal
 */
export function createProtobufProvider(): SchemaArtifactProvider {
  return {
    id: PROVIDER_ID,
    collect(program: Program): Promise<CollectedSchemaArtifacts> {
      return Promise.resolve(collectProtobufArtifacts(program));
    },
  };
}

/**
 * Renders a payload for every message model the official decorators mark.
 *
 * `refused` is set when any model the document asks about went unanswered.
 */
function collectProtobufArtifacts(program: Program): CollectedSchemaArtifacts {
  const asked = listMessages(program);
  const payloadFor = new Map<Model, ExternalSchemaArtifact>();

  let refused = false;
  for (const model of listProtobufMessageModels(program)) {
    // A model outside the document is skipped, not reported: a diagnostic
    // for it would name a message that does not exist.
    if (!asked.has(model)) continue;

    const payload = buildPayloadModel(program, model);
    if (payload === undefined) {
      refused = true;
      continue;
    }
    payloadFor.set(model, {
      schemaFormat: PROTOBUF_SCHEMA_FORMAT,
      schema: renderProtoFile(payload),
      provider: PROVIDER_ID,
      identity: qualifiedName(payload.packageName, payload.rootName),
    });
  }

  return { artifacts: { payloadFor }, refused };
}

/**
 * The name a Protobuf reader knows this message by.
 *
 * Never reaches the document; it only tells two artifacts apart. Two
 * messages can share a name but differ by package, so the package is
 * included whenever it declares one.
 */
function qualifiedName(packageName: string | undefined, rootName: string): string {
  return packageName === undefined ? rootName : `${packageName}.${rootName}`;
}
