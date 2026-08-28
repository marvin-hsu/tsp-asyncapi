/**
 * The JMS bindings.
 *
 * JMS defines a server, a channel and a message object. The server object is
 * the only one in this family with a required field.
 */

import { DecoratorContext, Interface, Model, Namespace } from "@typespec/compiler";
import { JMS_BINDING_PROTOCOL } from "../../../constants.js";
import { present, trimmed } from "../../../optional-fields.js";
import type {
  JmsChannelBindingObject,
  JmsMessageBindingObject,
  JmsServerBindingObject,
} from "../../../types/index.js";
import {
  enumeratedField,
  listField,
  objectField,
  reportBindingField,
  reportMissingField,
  schemaField,
} from "../fields.js";
import { claimBinding } from "../state.js";

type JmsServerBindingState = Omit<JmsServerBindingObject, "bindingVersion">;

type JmsChannelBindingState = Omit<JmsChannelBindingObject, "bindingVersion">;

type JmsMessageBindingState = Omit<JmsMessageBindingObject, "bindingVersion">;

/** The two kinds of destination JMS defines. */
const DESTINATION_TYPES = ["queue", "fifo-queue"];

/**
 * The `config` argument of `@jmsServer`, as the author wrote it.
 * @public
 */
export interface JmsServerBindingConfig {
  /** The class name of the connection factory. It is required. */
  jmsConnectionFactory?: string;
  /** The vendor-specific properties of the connection. */
  properties?: unknown;
  /** The client identifier of the connection. */
  clientID?: string;
}

/**
 * Adds the JMS server binding to the servers of one namespace.
 *
 * The emitted object lands in `servers.<name>.bindings.jms`, and it always
 * carries the `bindingVersion` this library targets.
 *
 * Apply it to the service namespace. Every server that namespace declares
 * gets its own copy, for the same reason `@kafkaServer` works that way.
 *
 * `jmsConnectionFactory` is required. A binding without it is reported and
 * dropped whole, because AsyncAPI would reject the emitted document.
 *
 * @param context - The decorator context
 * @param target - The service namespace
 * @param config - The JMS server binding fields
 *
 * @example
 * ```typespec
 * @jmsServer(#{ jmsConnectionFactory: "org.apache.activemq.ActiveMQConnectionFactory" })
 * @server("production", #{ host: "jms.example.com:61616", protocol: "jms" })
 * namespace Orders;
 * ```
 *
 * @public
 */
export function $jmsServer(
  context: DecoratorContext,
  target: Namespace,
  config: JmsServerBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const factory = trimmed(config.jmsConnectionFactory);
  if (factory === undefined) {
    reportMissingField(context, JMS_BINDING_PROTOCOL, "jmsConnectionFactory", configTarget);
    return;
  }

  const state: JmsServerBindingState = {
    jmsConnectionFactory: factory,
    ...present("properties", properties(context, config.properties, configTarget)),
    ...present("clientID", trimmed(config.clientID)),
  };

  claimBinding(context, {
    level: "server",
    target,
    protocol: JMS_BINDING_PROTOCOL,
    renderer: "jms",
    config: state,
    node: configTarget,
  });
}

/**
 * Checks the `properties` field of the server binding.
 *
 * JMS requires each entry to be an object with a `name` and a `value`. An
 * entry outside that is reported and dropped. An empty list is dropped,
 * because it states nothing.
 *
 * @param context - The decorator context
 * @param value - The field as the author wrote it
 * @param target - The type the decorator was applied to
 */
function properties(
  context: DecoratorContext,
  value: unknown,
  target: Parameters<typeof reportBindingField>[4],
): unknown[] | undefined {
  const plain = listField(context, JMS_BINDING_PROTOCOL, "properties", value, "a list", target);
  if (plain === undefined) return undefined;

  const entries: { name: string; value: unknown }[] = [];
  for (const [index, written] of plain.entries()) {
    const field = `properties[${String(index)}]`;
    const entry = objectField(context, JMS_BINDING_PROTOCOL, field, written, target);
    if (entry === undefined) continue;
    const name = typeof entry.name === "string" ? trimmed(entry.name) : undefined;
    if (name === undefined || !("value" in entry)) {
      reportBindingField(
        context,
        JMS_BINDING_PROTOCOL,
        field,
        "an object with a name and a value",
        target,
      );
      continue;
    }
    entries.push({ name, value: entry.value });
  }
  return entries.length > 0 ? entries : undefined;
}

/**
 * The `config` argument of `@jmsChannel`, as the author wrote it.
 * @public
 */
export interface JmsChannelBindingConfig {
  /** The name of the destination. */
  destination?: string;
  /** What the destination is: `queue` or `fifo-queue`. */
  destinationType?: string;
}

/**
 * Adds the JMS channel binding to one channel.
 *
 * The emitted object lands in `channels.<key>.bindings.jms`, and it always
 * carries the `bindingVersion` this library targets.
 *
 * Apply it to the interface or namespace that carries `@channel` or
 * `@dynamicChannel`.
 *
 * `destinationType` is `queue` or `fifo-queue`. JMS lists no topic here,
 * unlike Anypoint MQ, which also allows `exchange`.
 *
 * @param context - The decorator context
 * @param target - The channel interface or namespace
 * @param config - The JMS channel binding fields
 *
 * @example
 * ```typespec
 * @jmsChannel(#{ destination: "orders", destinationType: "queue" })
 * @channel("orders")
 * interface OrderChannel {}
 * ```
 *
 * @public
 */
export function $jmsChannel(
  context: DecoratorContext,
  target: Interface | Namespace,
  config: JmsChannelBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: JmsChannelBindingState = {
    ...present("destination", trimmed(config.destination)),
    ...present(
      "destinationType",
      enumeratedField(
        context,
        JMS_BINDING_PROTOCOL,
        "destinationType",
        config.destinationType,
        DESTINATION_TYPES,
        configTarget,
      ),
    ),
  };

  claimBinding(context, {
    level: "channel",
    target,
    protocol: JMS_BINDING_PROTOCOL,
    renderer: "jms",
    config: state,
    node: configTarget,
  });
}

/**
 * The `config` argument of `@jmsMessage`, as the author wrote it.
 * @public
 */
export interface JmsMessageBindingConfig {
  /** The headers of the message, as a Schema Object. */
  headers?: unknown;
}

/**
 * Adds the JMS message binding to one message.
 *
 * The emitted object lands in `components.messages.<key>.bindings.jms`, and
 * it always carries the `bindingVersion` this library targets.
 *
 * Apply it to a model that also carries `@message`.
 *
 * @param context - The decorator context
 * @param target - The message model
 * @param config - The JMS message binding fields
 *
 * @example
 * ```typespec
 * @jmsMessage(#{ headers: #{ type: "object" } })
 * @message
 * model OrderCreated {
 *   id: string;
 * }
 * ```
 *
 * @public
 */
export function $jmsMessage(
  context: DecoratorContext,
  target: Model,
  config: JmsMessageBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: JmsMessageBindingState = {
    ...present(
      "headers",
      schemaField(context, JMS_BINDING_PROTOCOL, "headers", config.headers, configTarget),
    ),
  };

  claimBinding(context, {
    level: "message",
    target,
    protocol: JMS_BINDING_PROTOCOL,
    renderer: "jms",
    config: state,
    node: configTarget,
  });
}
