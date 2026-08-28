import { DecoratorContext, Interface, Namespace } from "@typespec/compiler";
import { PULSAR_BINDING_PROTOCOL } from "../../../constants.js";
import { present, trimmed } from "../../../optional-fields.js";
import { claimBinding } from "../state.js";
import { reportMissingField } from "../fields.js";
import {
  PulsarChannelBindingState,
  compaction,
  geoReplication,
  persistence,
  retention,
} from "./config.js";

/**
 * The `config` argument of `@pulsarChannel`, as the author wrote it.
 * @public
 */
export interface PulsarChannelBindingConfig {
  /** The namespace the topic lives in. */
  namespace?: string;
  /** Whether the topic is `persistent` or `non-persistent`. */
  persistence?: string;
  /** The compaction threshold in megabytes. */
  compaction?: number;
  /** The clusters the topic is replicated to. */
  geoReplication?: unknown;
  /** How long a message is kept. */
  retention?: unknown;
  /** The time to live in seconds. */
  ttl?: number;
  /** Whether the broker drops a repeated message. */
  deduplication?: boolean;
}

/**
 * Adds the Pulsar channel binding to one channel.
 *
 * The emitted object lands in `channels.<key>.bindings.pulsar`, and it always
 * carries the `bindingVersion` this library targets.
 *
 * Apply it to the interface or namespace that carries `@channel` or
 * `@dynamicChannel`.
 *
 * `namespace` and `persistence` are required. A binding without either one is
 * reported and dropped whole, because AsyncAPI would reject the emitted
 * document. `persistence` is `persistent` or `non-persistent`. A value
 * outside those two costs the binding as well.
 *
 * `geoReplication` is written under that name because a TypeSpec field cannot
 * hold a dash. The emitted field is `geo-replication`, which is the name
 * Pulsar gives it.
 *
 * @example
 * ```typespec
 * @pulsarChannel(#{
 *   namespace: "orders",
 *   persistence: "persistent",
 *   retention: #{ time: 1440, size: 1000 }
 * })
 * @channel("orders.created")
 * interface OrderChannel {}
 * ```
 *
 * @public
 */
export function $pulsarChannel(
  context: DecoratorContext,
  target: Interface | Namespace,
  config: PulsarChannelBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;

  // The two required fields are settled first. Neither can be emitted when it
  // is absent or rejected, and the binding needs both, so the binding goes
  // whole either way.
  const space = trimmed(config.namespace);
  const written = trimmed(config.persistence);
  const storage = persistence(context, config.persistence, configTarget);
  if (space === undefined) {
    reportMissingField(context, PULSAR_BINDING_PROTOCOL, "namespace", configTarget);
  }
  // The author who wrote a value outside the set has already read that. A
  // second report saying the binding does not give the field would name a
  // field they did give.
  if (written === undefined) {
    reportMissingField(context, PULSAR_BINDING_PROTOCOL, "persistence", configTarget);
  }
  if (space === undefined || storage === undefined) return;

  const state: PulsarChannelBindingState = {
    namespace: space,
    persistence: storage,
    ...present("compaction", compaction(context, config.compaction, configTarget)),
    ...present("geo-replication", geoReplication(context, config.geoReplication, configTarget)),
    ...present("retention", retention(context, config.retention, configTarget)),
    ...present("ttl", config.ttl),
    ...present("deduplication", config.deduplication),
  };

  claimBinding(context, {
    level: "channel",
    target,
    protocol: PULSAR_BINDING_PROTOCOL,
    renderer: "pulsar",
    config: state,
    node: configTarget,
  });
}
