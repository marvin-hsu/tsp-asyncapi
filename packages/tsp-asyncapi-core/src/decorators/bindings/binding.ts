/**
 * The `@binding` decorator: the escape hatch for a protocol with no
 * decorator of its own, or a field a newer binding version added.
 *
 * Unlike a protocol-specific decorator, it names no level and checks no
 * field. It emits the config exactly as written, into whichever level the
 * target reaches. One protocol claims one slot per level per target, and
 * this decorator never merges its config with a protocol-specific decorator
 * that already claimed the same slot.
 */

import { DecoratorContext, Type } from "@typespec/compiler";
import { reportDiagnostic } from "../../lib.js";
import { claimBinding } from "./state.js";
import { isPlainObject, toPlainValue } from "../../marshalled-values.js";

/**
 * Adds one raw protocol binding to whichever object the target emits.
 *
 * This is the escape hatch. AsyncAPI defines a binding specification per
 * protocol, and this library ships a decorator only for some of them. Use
 * this decorator for a protocol that has no decorator yet, and for a field a
 * newer binding version added.
 *
 * The config is emitted exactly as written. This decorator adds no
 * `bindingVersion`, because it does not read the shape of the config and
 * cannot know which version the fields belong to. Write the field yourself
 * when the protocol needs it.
 *
 * The target is `unknown`, because all four levels that carry a Bindings
 * Object are reachable: a server namespace, a channel interface or namespace,
 * an operation, and a message model. This decorator names no level, so the
 * binding lands wherever the target emits an object. A namespace that is both
 * the service namespace and a channel target therefore carries the binding at
 * both levels. Use the protocol-specific decorator when only one of the two
 * is meant.
 *
 * One protocol claims one slot per level per target. A second application of
 * the same protocol name reports a diagnostic, and the whole binding is
 * dropped. The same happens to a `@binding` that names the protocol a
 * protocol-specific decorator already claimed. The two configurations are
 * never merged.
 *
 * A binding whose target emits no object at all is reported once the document
 * is built.
 *
 * @param context - The decorator context
 * @param target - The server namespace, channel, operation, or message model
 * @param protocol - The member name inside the emitted `bindings` object, such
 * as `kafka` or `mqtt`
 * @param config - The binding fields, emitted as written
 *
 * @example
 * ```typespec
 * @binding("mqtt", #{ qos: 2, retain: true })
 * @channel("orders.created")
 * interface OrderChannel {}
 * ```
 *
 * @public
 */
export function $binding(
  context: DecoratorContext,
  target: Type,
  protocol: string,
  config: unknown,
) {
  const protocolTarget = context.getArgumentTarget(0) ?? target;
  const configTarget = context.getArgumentTarget(1) ?? target;

  const name = protocol.trim();
  if (name === "") {
    // The protocol name becomes a member name of the Bindings Object, and a
    // blank member name is not legal. The name is written by hand, so it is
    // reported rather than replaced with something the author never asked
    // for.
    reportDiagnostic(context.program, { code: "empty-binding-protocol", target: protocolTarget });
    return;
  }

  const value = toPlainValue(context.program, config);
  if (!isPlainObject(value)) {
    reportDiagnostic(context.program, {
      code: "invalid-binding-config",
      format: { protocol: name },
      target: configTarget,
    });
    return;
  }

  claimBinding(context, {
    level: "any",
    target,
    protocol: name,
    renderer: "verbatim",
    config: value,
    node: protocolTarget,
  });
}
