/**
 * The semantic model, exported with no stability promise.
 *
 * One resolve produces this model and one lower reads it. An emitter in another
 * package cannot read a model it cannot name, so these names have to be
 * exported. They are the only exports of this library whose shape is expected
 * to change.
 *
 * That is why they sit behind their own entry point rather than in the main
 * one. The main entry point is a semver promise. This one is not: a node may
 * gain a field, lose one, or change what a field holds, in any release.
 *
 * Nothing here was public before the split. `src/index.ts` never exported this
 * file, and that was the whole defence. The defence is gone, so the entry point
 * name carries the warning instead.
 *
 * An emitter maintained in this repository is the intended consumer. It moves
 * with this package, so a change here is one commit rather than a migration.
 * Code outside this repository that imports from here takes on that migration.
 *
 * This is `@typespec/events`'s approach, which puts its own model behind
 * `./experimental` with an `unsafe_` prefix. The name here says the same thing
 * about stability, and says it about the whole entry point rather than about
 * each name.
 */

export { asyncAPILinter } from "./linter.js";
export { resolveService } from "./resolve/service.js";
export { BindingPlacements } from "./resolve/bindings.js";
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
