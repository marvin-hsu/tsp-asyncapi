/**
 * The Protobuf provider, as the registry holds it.
 *
 * The parts it joins already exist. The state reader says which models the
 * author marked and which package each one belongs to. The walk builds the
 * closure of one model. The printer writes that closure as proto3 text. This
 * file runs them over a whole program and hands back one artifact per model.
 *
 * One model is one payload. A payload carries the message the model names and
 * every declaration that message reaches, so two messages of one package are
 * two texts and not one shared text. The root of a text is the message the
 * payload was built for. A Protobuf reader finds that root as the declaration
 * nothing else references, which holds unless two messages reference each
 * other.
 *
 * ## Who gets told
 *
 * A payload is built only for a model the document asks one for, which is a
 * model that carries `@AsyncAPI.message` as well. A project that uses the
 * official decorators for types outside the document keeps its build green,
 * and no diagnostic names a model no message describes.
 *
 * A model the document asks about and this cannot answer for is a refusal.
 * The caller stops on one. Its payload would otherwise fall back to the
 * schema its TypeSpec type produces, which answers a request for proto3 with
 * ordinary JSON Schema and says so nowhere in the file.
 */

import type { Model, Program } from "@typespec/compiler";
import { listMessages, type ExternalSchemaArtifact } from "tsp-asyncapi-core";
import { buildPayloadModel } from "./protobuf/model.js";
import { renderProtoFile } from "./protobuf/render.js";
import { listProtobufMessageModels } from "./protobuf/state.js";
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
 * The provider is built rather than exported as a constant, so two emits of
 * one program each get their own. Nothing in it holds state between calls.
 *
 * @returns The provider, ready for the registry
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
 * @param program - The compiled program
 * @returns The payload artifact of every model that got one, and whether any
 * model the document names went unanswered
 */
function collectProtobufArtifacts(program: Program): CollectedSchemaArtifacts {
  const asked = listMessages(program);
  const payloadFor = new Map<Model, ExternalSchemaArtifact>();

  let refused = false;
  for (const model of listProtobufMessageModels(program)) {
    // A model outside the document is not asked about, so it is neither
    // rendered nor reported. The walk reports as it goes, and a report for
    // such a model would name a message that does not exist.
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

  return { artifacts: { payloadFor, headersFor: new Map() }, refused };
}

/**
 * The name a Protobuf reader knows this message by.
 *
 * The identity never reaches the document. It tells two artifacts apart, and
 * two messages differ by their package as well as by their name. So the
 * package is part of it whenever the package declares one.
 *
 * @param packageName - The package name, if the package declares one
 * @param rootName - The name of the message the payload describes
 * @returns The fully qualified message name
 */
function qualifiedName(packageName: string | undefined, rootName: string): string {
  return packageName === undefined ? rootName : `${packageName}.${rootName}`;
}
