/**
 * Schemas another tool generated, as values the resolve stage can read.
 *
 * A model can carry decorators of another schema language, such as the
 * official Protobuf ones. The schema for such a model is not written by hand
 * and it is not built from the TypeSpec type. Another tool builds it, and the
 * result reaches this pipeline as text or as an object.
 *
 * These types hold that result and nothing else. They name no tool and they
 * import no emitter, so this package keeps its one direction: an emitter
 * package depends on this one, and never the other way. The tool that
 * produces an artifact runs in the emitter package, before resolve starts.
 *
 * An artifact is an input to resolve, not a fourth stage. Collection finishes
 * before resolve begins, and what it hands over is immutable.
 */

import type { Model } from "@typespec/compiler";

/**
 * One schema another tool generated for one model.
 *
 * `schemaFormat` and `schema` are the two fields of the AsyncAPI Multi Format
 * Schema Object, so an artifact reaches the document without translation.
 * `schema` is `unknown` because the format decides the shape: Protobuf gives
 * proto3 text, and a JSON-based format gives an object.
 *
 * `provider` and `identity` never reach the document. They name where the
 * artifact came from, so a diagnostic can say which tool claimed a model, and
 * a test can tell two artifacts apart.
 *
 * @public
 */
export interface ExternalSchemaArtifact {
  /** The format of `schema`, such as `application/vnd.google.protobuf`. */
  readonly schemaFormat: string;
  /** The schema itself, in the language `schemaFormat` names. */
  readonly schema: unknown;
  /** The provider that produced the artifact, such as `protobuf`. */
  readonly provider: string;
  /** What the provider calls this artifact, such as its package name. */
  readonly identity: string;
}

/**
 * Every artifact one collection produced, by model.
 *
 * A message has two schema slots, and only the payload takes an artifact. A
 * header travels beside the message as its own key and value, so no transport
 * carries the headers object as one encoded block, and neither Protobuf nor
 * Avro can name a field `x-correlation-id` in the first place. Headers are
 * lowered from their TypeSpec model, whatever the payload is written in.
 *
 * @public
 */
export interface SchemaArtifactIndex {
  /** The artifact that describes the payload of each model. */
  readonly payloadFor: ReadonlyMap<Model, ExternalSchemaArtifact>;
}

/**
 * The index of a build that ran no provider.
 *
 * This is the default everywhere an index is optional. Every lookup misses,
 * so a build with no provider sees no artifacts at all.
 *
 * @public
 */
export const emptySchemaArtifacts: SchemaArtifactIndex = {
  payloadFor: new Map<Model, ExternalSchemaArtifact>(),
};
