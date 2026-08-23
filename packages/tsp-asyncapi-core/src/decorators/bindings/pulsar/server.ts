import { DecoratorContext, Namespace } from "@typespec/compiler";
import { PULSAR_BINDING_PROTOCOL } from "../../../constants.js";
import { present, trimmed } from "../../../optional-fields.js";
import { claimBinding } from "../state.js";
import { PulsarServerBindingState } from "./config.js";

/**
 * The `config` argument of `@pulsarServer`, as the author wrote it.
 * @public
 */
export interface PulsarServerBindingConfig {
  /** The tenant the server belongs to. */
  tenant?: string;
}

/**
 * Adds the Pulsar server binding to the servers of one namespace.
 *
 * The emitted object lands in `servers.<name>.bindings.pulsar`, and it always
 * carries the `bindingVersion` this library targets.
 *
 * Apply it to the service namespace. Every server that namespace declares
 * gets its own copy, for the same reason `@kafkaServer` works that way.
 *
 * `tenant` names the Pulsar tenant. A topic is addressed as
 * `<tenant>/<namespace>/<topic>`, so the tenant here and the namespace on the
 * channel binding are two parts of one address.
 *
 * @param context - The decorator context
 * @param target - The service namespace
 * @param config - The Pulsar server binding fields
 *
 * @example
 * ```typespec
 * @pulsarServer(#{ tenant: "orders" })
 * @server("production", #{ host: "pulsar.example.com:6650", protocol: "pulsar" })
 * namespace Orders;
 * ```
 *
 * @public
 */
export function $pulsarServer(
  context: DecoratorContext,
  target: Namespace,
  config: PulsarServerBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: PulsarServerBindingState = {
    ...present("tenant", trimmed(config.tenant)),
  };

  claimBinding(context, {
    level: "server",
    target,
    protocol: PULSAR_BINDING_PROTOCOL,
    renderer: "pulsar",
    config: state,
    node: configTarget,
  });
}
