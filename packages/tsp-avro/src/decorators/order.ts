/**
 * The `@order` decorator and its reader.
 *
 * A field carries at most one Avro order: `ascending`, `descending`, or
 * `ignore`. This file records that mark and validates it against the three
 * orders the Avro specification names. The walk reads the result when it
 * renders a field. A field with no mark renders with no explicit order.
 */

import { DecoratorContext, ModelProperty, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../lib.js";
import type { AvroFieldOrder } from "../types.js";

const orderStateKey = Symbol.for("tsp-avro.order");

const [getOrderInternal, setOrderInternal] = useStateMap<ModelProperty, AvroFieldOrder>(
  orderStateKey,
);

/**
 * The three orders the Avro specification names.
 *
 * A set, because the only question asked of it is whether a value is in it.
 */
const ORDERS = new Set<string>(["ascending", "descending", "ignore"]);

/**
 * Whether one string is an order this emitter writes.
 *
 * The narrowing is what lets the caller pass the value on without a cast. The
 * decorator receives a plain string, and the set is what makes it one of the
 * three.
 *
 * @param mode - The value the decorator received
 * @returns Whether the specification names it
 */
function isOrder(mode: string): mode is AvroFieldOrder {
  return ORDERS.has(mode);
}

/**
 * Declares how a reader sorts records by this field.
 *
 * Avro compares two records field by field, in declaration order. This says
 * what one field contributes: `ascending` and `descending` order by the value,
 * and `ignore` takes the field out of the comparison altogether.
 *
 * Avro writes `ascending` when a field says nothing, so declaring `ascending`
 * here changes the schema text and nothing else.
 *
 * @param context - The decorator context
 * @param target - The field to order by
 * @param mode - One of `ascending`, `descending` or `ignore`
 *
 * @example
 * ```typespec
 * model OrderPlaced {
 *   @order("descending") placedAt: int64;
 * }
 * ```
 *
 * @public
 */
export function $order(context: DecoratorContext, target: ModelProperty, mode: string): void {
  if (!isOrder(mode)) {
    reportDiagnostic(context.program, {
      code: "invalid-order",
      format: { mode },
      target: context.decoratorTarget,
    });
    return;
  }
  setOrderInternal(context.program, target, mode);
}

/**
 * Reads the order declared on a field.
 *
 * @param program - The program to read the state from
 * @param target - The field to read
 * @returns The order, or undefined when the field declares none
 *
 * @public
 */
export function getAvroOrder(program: Program, target: ModelProperty): AvroFieldOrder | undefined {
  return getOrderInternal(program, target);
}
