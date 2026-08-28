/**
 * The NATS binding.
 *
 * One decorator covers the whole protocol. NATS defines an operation object
 * and nothing else, and that object carries one field.
 */

import { DecoratorContext, Operation } from "@typespec/compiler";
import { NATS_BINDING_PROTOCOL } from "../../constants.js";
import { present } from "../../optional-fields.js";
import type { NatsOperationBindingObject } from "../../types/index.js";
import { boundedName } from "./fields.js";
import { claimBinding } from "./state.js";

/**
 * What `@natsOperation` records.
 *
 * It is the emitted object without `bindingVersion`. That field is appended
 * when the document is built.
 */
type NatsOperationBindingState = Omit<NatsOperationBindingObject, "bindingVersion">;

/** The longest queue group name NATS allows. */
const MAX_QUEUE_LENGTH = 255;

/**
 * The `config` argument of `@natsOperation`, as the author wrote it.
 * @public
 */
export interface NatsOperationBindingConfig {
  /** The queue group the subscription joins. */
  queue?: string;
}

/**
 * Adds the NATS binding to one operation.
 *
 * The emitted object lands in `operations.<key>.bindings.nats`, and it always
 * carries the `bindingVersion` this library targets.
 *
 * Apply it to an operation that carries `@send` or `@receive`.
 *
 * `queue` names the queue group the subscription joins. NATS delivers each
 * message to one member of a queue group rather than to all of them. The name
 * is at most 255 characters, and a longer one is reported and dropped.
 *
 * NATS has no server, channel or message binding.
 *
 * @example
 * ```typespec
 * @natsOperation(#{ queue: "readings-workers" })
 * @receive
 * op onReading(): Reading;
 * ```
 *
 * @public
 */
export function $natsOperation(
  context: DecoratorContext,
  target: Operation,
  config: NatsOperationBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: NatsOperationBindingState = {
    ...present(
      "queue",
      boundedName(
        context,
        NATS_BINDING_PROTOCOL,
        "queue",
        config.queue,
        MAX_QUEUE_LENGTH,
        configTarget,
      ),
    ),
  };

  claimBinding(context, {
    level: "operation",
    target,
    protocol: NATS_BINDING_PROTOCOL,
    renderer: "nats",
    config: state,
    node: configTarget,
  });
}
