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
 */
const ORDERS: readonly AvroFieldOrder[] = ["ascending", "descending", "ignore"];

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
  if (!ORDERS.includes(mode as AvroFieldOrder)) {
    reportDiagnostic(context.program, {
      code: "invalid-order",
      format: { mode },
      target: context.decoratorTarget,
    });
    return;
  }
  setOrderInternal(context.program, target, mode as AvroFieldOrder);
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
