/**
 * The Solace bindings.
 *
 * Solace defines a server object and an operation object. It defines no
 * channel or message object with fields of its own.
 *
 * `destinations` is a list, and Solace states two shapes for an entry: a
 * queue and a topic. The one rule this emitter checks on an entry is
 * `deliveryMode`, which both shapes share. The rest of an entry passes
 * through as written, because choosing between the two shapes here would mean
 * re-implementing a `oneOf` the official parser already applies.
 */

import { DecoratorContext, DiagnosticTarget, Namespace, Operation } from "@typespec/compiler";
import { SOLACE_BINDING_PROTOCOL } from "../../../constants.js";
import { present, trimmed } from "../../../optional-fields.js";
import { isPlainObject, toPlainValue } from "../../../marshalled-values.js";
import { SolaceOperationBindingObject, SolaceServerBindingObject } from "../../../types/index.js";
import { enumeratedField, reportBindingField } from "../fields.js";
import { claimBinding } from "../state.js";

/** @internal */
export type SolaceServerBindingState = Omit<SolaceServerBindingObject, "bindingVersion">;

/** @internal */
export type SolaceOperationBindingState = Omit<SolaceOperationBindingObject, "bindingVersion">;

/** The two ways Solace delivers a message. */
const DELIVERY_MODES = ["direct", "persistent"];

/** The longest client name Solace allows. */
const MAX_CLIENT_NAME = 160;

/**
 * The `config` argument of `@solaceServer`, as the author wrote it.
 * @public
 */
export interface SolaceServerBindingConfig {
  /** The message VPN the client connects to. */
  msgVpn?: string;
  /** The name the client connects under. */
  clientName?: string;
}

/**
 * Adds the Solace server binding to the servers of one namespace.
 *
 * The emitted object lands in `servers.<name>.bindings.solace`, and it always
 * carries the `bindingVersion` this library targets.
 *
 * Apply it to the service namespace. Every server that namespace declares
 * gets its own copy, for the same reason `@kafkaServer` works that way.
 *
 * `clientName` is at most 160 characters. A longer one is reported and
 * dropped.
 *
 * The emitted field is `msgVpn`. Version 0.2.0 of the Solace binding spells
 * it `msvVpn`, and this library emits 0.4.0, which spells it `msgVpn`.
 *
 * @param context - The decorator context
 * @param target - The service namespace
 * @param config - The Solace server binding fields
 *
 * @example
 * ```typespec
 * @solaceServer(#{ msgVpn: "orders-vpn", clientName: "order-service" })
 * @server("production", #{ host: "solace.example.com:55555", protocol: "smf" })
 * namespace Orders;
 * ```
 *
 * @public
 */
export function $solaceServer(
  context: DecoratorContext,
  target: Namespace,
  config: SolaceServerBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: SolaceServerBindingState = {
    ...present("msgVpn", trimmed(config.msgVpn)),
    ...present("clientName", clientName(context, config.clientName, configTarget)),
  };

  claimBinding(context, {
    level: "server",
    target,
    protocol: SOLACE_BINDING_PROTOCOL,
    renderer: "solace",
    config: state,
    node: configTarget,
  });
}

/** Checks the length limit Solace states for a client name. */
function clientName(
  context: DecoratorContext,
  value: string | undefined,
  target: DiagnosticTarget,
): string | undefined {
  const name = trimmed(value);
  if (name === undefined) return undefined;
  if (name.length > MAX_CLIENT_NAME) {
    reportBindingField(
      context,
      SOLACE_BINDING_PROTOCOL,
      "clientName",
      `at most ${String(MAX_CLIENT_NAME)} characters`,
      target,
    );
    return undefined;
  }
  return name;
}

/**
 * The `config` argument of `@solaceOperation`, as the author wrote it.
 * @public
 */
export interface SolaceOperationBindingConfig {
  /** Where the operation sends to or reads from. */
  destinations?: unknown;
  /** How long a message stays valid, in milliseconds. */
  timeToLive?: number;
  /** The priority of the message. */
  priority?: number;
  /** Whether an undeliverable message goes to the dead message queue. */
  dmqEligible?: boolean;
}

/**
 * Adds the Solace operation binding to one operation.
 *
 * The emitted object lands in `operations.<key>.bindings.solace`, and it
 * always carries the `bindingVersion` this library targets.
 *
 * Apply it to an operation that carries `@send` or `@receive`.
 *
 * `destinations` is a list of queues and topics. Each entry may carry a
 * `deliveryMode` of `direct` or `persistent`, and any other value is reported
 * and dropped from that entry.
 *
 * `priority` is zero or more. A list left with no entry is dropped, because
 * an empty list names no destination.
 *
 * @param context - The decorator context
 * @param target - The operation
 * @param config - The Solace operation binding fields
 *
 * @example
 * ```typespec
 * @solaceOperation(#{
 *   destinations: #[
 *     #{ destinationType: "queue", deliveryMode: "persistent", queue: #{ name: "orders" } }
 *   ],
 *   timeToLive: 60000
 * })
 * @send
 * op publish(event: OrderCreated): void;
 * ```
 *
 * @public
 */
export function $solaceOperation(
  context: DecoratorContext,
  target: Operation,
  config: SolaceOperationBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: SolaceOperationBindingState = {
    ...present("destinations", destinations(context, config.destinations, configTarget)),
    ...present("timeToLive", config.timeToLive),
    ...present("priority", priority(context, config.priority, configTarget)),
    ...present("dmqEligible", config.dmqEligible),
  };

  claimBinding(context, {
    level: "operation",
    target,
    protocol: SOLACE_BINDING_PROTOCOL,
    renderer: "solace",
    config: state,
    node: configTarget,
  });
}

/** Checks the `priority` field, which Solace states as zero or more. */
function priority(
  context: DecoratorContext,
  value: number | undefined,
  target: DiagnosticTarget,
): number | undefined {
  if (value === undefined) return undefined;
  if (value < 0) {
    reportBindingField(context, SOLACE_BINDING_PROTOCOL, "priority", "zero or more", target);
    return undefined;
  }
  return value;
}

/** Reads the destination list, checking the one rule an entry shares. */
function destinations(
  context: DecoratorContext,
  value: unknown,
  target: DiagnosticTarget,
): Record<string, unknown>[] | undefined {
  if (value === undefined) return undefined;
  const plain = toPlainValue(context.program, value);
  if (!Array.isArray(plain)) {
    reportBindingField(
      context,
      SOLACE_BINDING_PROTOCOL,
      "destinations",
      "a list of destinations",
      target,
    );
    return undefined;
  }

  const entries: Record<string, unknown>[] = [];
  for (const [index, entry] of plain.entries()) {
    if (!isPlainObject(entry)) {
      reportBindingField(
        context,
        SOLACE_BINDING_PROTOCOL,
        `destinations[${String(index)}]`,
        "an object",
        target,
      );
      continue;
    }
    const mode = enumeratedField(
      context,
      SOLACE_BINDING_PROTOCOL,
      `destinations[${String(index)}].deliveryMode`,
      entry.deliveryMode as string | undefined,
      DELIVERY_MODES,
      target,
    );
    // A rejected delivery mode takes only itself away. The entry still names
    // the queue or the topic the author wrote.
    const kept = Object.fromEntries(
      Object.entries(entry).filter(([key]) => key !== "deliveryMode"),
    );
    entries.push({ ...present("deliveryMode", mode), ...kept });
  }
  return entries.length > 0 ? entries : undefined;
}
