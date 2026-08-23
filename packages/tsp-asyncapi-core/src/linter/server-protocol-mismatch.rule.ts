/**
 * Warns when a server binding names a protocol no server on that namespace
 * speaks.
 *
 * `@kafkaServer` on a namespace whose only `@server` declares
 * `protocol: "mqtt"` emits a `kafka` member inside that server's Bindings
 * Object. The document then says the connection is MQTT and configures it
 * with Kafka settings. Nothing checks the two against each other today:
 * `@server` validates its protocol only for being non-blank, and
 * `resolve/bindings.ts` checks for one binding per protocol per level and
 * for a binding on a target that emits nothing.
 *
 * ## Why it reports per namespace rather than per server
 *
 * `resolveServers` calls `resolveBindings(program, "server", namespace, …)`.
 * A server-level binding is recorded against the **namespace**, not against
 * one `@server`, so every server the namespace declares receives the same
 * Bindings Object.
 *
 * A namespace that declares a Kafka server and an MQTT server, plus one
 * `@kafkaServer`, is therefore written the way the author asked. Reporting
 * per server would flag the MQTT one for carrying a binding it never asked
 * for. So the rule fires only when the binding matches **none** of them,
 * which is the case no reading of the source makes correct.
 */

import { createRule, paramMessage } from "@typespec/compiler";
import { getServers } from "../decorators/index.js";
import { listBindings } from "../decorators/bindings/state.js";

/**
 * The `protocol` values of `@server` that each binding member describes.
 *
 * AsyncAPI names the secure transport separately from the plain one, and
 * both are configured by the same binding. `kafka-secure` is still Kafka.
 *
 * A member name is not always the protocol name. The Solace binding is
 * `solace` and the protocol it configures is `smf`, Solace Message Format.
 * That row was wrong when this rule was written, and
 * `examples/14-streaming-platforms` is what caught it.
 *
 * A `Map` rather than an object literal, because a lookup that misses has
 * to read as `undefined`. This repository does not set
 * `noUncheckedIndexedAccess`, so indexing a `Record` types the miss as a
 * value that is always there, and the guard below would be deleted as dead.
 *
 * A member with no row here is not checked. That is deliberate: a wrong
 * answer about a protocol this table has not learned would be worse than no
 * answer.
 *
 * The generic `@binding` never reaches this table anyway. It records the
 * level `any` rather than `server`, so the loop below skips it before the
 * lookup.
 */
const SERVER_PROTOCOLS = new Map<string, readonly string[]>([
  ["kafka", ["kafka", "kafka-secure"]],
  ["mqtt", ["mqtt", "mqtts", "secure-mqtt"]],
  ["ws", ["ws", "wss"]],
  ["http", ["http", "https"]],
  ["amqp", ["amqp", "amqps"]],
  ["nats", ["nats"]],
  ["pulsar", ["pulsar"]],
  ["googlepubsub", ["googlepubsub"]],
  ["sqs", ["sqs"]],
  ["anypointmq", ["anypointmq"]],
  ["jms", ["jms"]],
  ["ibmmq", ["ibmmq"]],
  ["solace", ["smf", "smfs"]],
]);

export const serverProtocolMismatchRule = createRule({
  name: "server-protocol-mismatch",
  severity: "warning",
  description: "Require a server binding to match the protocol of a server on its namespace.",
  messages: {
    default: paramMessage`This '${"binding"}' server binding names a protocol no server here speaks. The namespace declares ${"protocols"}. Either change the \`@server\` protocol or remove the binding.`,
  },
  create: (context) => ({
    namespace: (namespace) => {
      const program = context.program;

      const servers = getServers(program, namespace);
      // A namespace with no server has nowhere to put a binding at all, and
      // `binding-outside-document` already reports that.
      if (servers.length === 0) return;

      const spoken = new Set(servers.map((server) => server.protocol.trim().toLowerCase()));

      for (const entry of listBindings(program, namespace)) {
        if (entry.level !== "server") continue;

        const accepted = SERVER_PROTOCOLS.get(entry.protocol);
        if (accepted === undefined) continue;
        if (accepted.some((protocol) => spoken.has(protocol))) continue;

        context.reportDiagnostic({
          format: {
            binding: entry.protocol,
            protocols: [...spoken].map((protocol) => `'${protocol}'`).join(", "),
          },
          target: entry.node,
        });
      }
    },
  }),
});
