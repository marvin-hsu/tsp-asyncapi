/**
 * The semantic model, exported with no stability promise.
 *
 * One resolve produces this model and one lower reads it. An emitter in
 * another package cannot read a model it cannot name, so these names have to
 * be exported. They are the only exports of this library whose shape may
 * change in any release: a node may gain a field, lose one, or change what a
 * field holds.
 *
 * They sit behind this entry point, not the main one, because the main entry
 * point is a semver promise and this one is not. The entry point name itself
 * carries that warning.
 *
 * An emitter maintained in this repository is the intended consumer. It moves
 * with this package, so a change here is one commit rather than a migration
 * for code outside this repository.
 *
 * `@typespec/events` takes the same approach, putting its own model behind
 * `./experimental` with an `unsafe_` prefix.
 */

export { asyncAPILinter } from "./linter.js";
export { resolveService } from "./resolve/service.js";
// `resolveService` takes an index of generated schemas. A consumer of this
// entry point has to be able to name the argument it passes.
export { emptySchemaArtifacts } from "./schema-artifacts.js";
export type { ExternalSchemaArtifact, SchemaArtifactIndex } from "./schema-artifacts.js";
export { BindingPlacements } from "./resolve/bindings.js";
// The official Protobuf decorator state. The emitter renders payloads from
// it, and a linter rule in this package asks whether a message carries those
// decorators, so the readers live here rather than beside either caller.
export {
  isProtobufExternRef,
  isProtobufMap,
  listProtobufMessageModels,
  protobufFieldIndexOf,
  protobufReservationsOf,
  protoMessageNameOf,
  resolveProtobufPackage,
} from "./protobuf-state.js";
export type { ProtobufPackage, UnreadableProtobufPackage } from "./protobuf-state.js";
export type {
  AsyncAPIService,
  BindingNode,
  ChannelNode,
  ChannelParameterNode,
  InfoNode,
  MessageHeadersNode,
  MessageNode,
  MessagePayloadNode,
  MessageRefNode,
  OperationNode,
  OperationReplyNode,
  SecuritySchemeNode,
  ServerNode,
  ServerVariableNode,
} from "./resolve/service.js";
