import { DecoratorContext, ModelProperty, Program } from "@typespec/compiler";
import { useStateSet } from "@typespec/compiler/utils";

const headerStateKey = Symbol.for("tsp-asyncapi.header");

const [isHeaderInternal, markHeader] = useStateSet<ModelProperty>(headerStateKey);

/**
 * Marks one field of a message model as a message header.
 *
 * The emitter lifts every marked field out of the payload schema. It
 * collects them into the message's `headers` schema. The payload keeps only
 * the fields that carry no mark.
 *
 * Only a top-level field of a `@message` model is lifted. A field further
 * down the payload stays where it is, and the emitter reports
 * `nested-header-ignored`. `@typespec/http` sets that precedent: it reads
 * metadata off the top level of a payload only, and warns about a mark it
 * cannot honour.
 *
 * This is a plain marker. It carries no name of its own, unlike
 * `@typespec/http`'s `@header`. Two reasons. AsyncAPI application headers
 * have no naming convention to convert to, so there is nothing to override
 * by default. And the emitter already reads `@encodedName` for the wire name
 * of every property, so a header whose name is not a TypeSpec identifier is
 * already expressible.
 *
 * @param context - The decorator context
 * @param target - The message model field to lift into `headers`
 *
 * @example
 * ```typespec
 * @message
 * model OrderCreated {
 *   @header
 *   @encodedName("application/json", "x-correlation-id")
 *   correlationId: string;
 *
 *   orderId: string;
 * }
 * ```
 *
 * @public
 */
export function $header(context: DecoratorContext, target: ModelProperty) {
  markHeader(context.program, target);
}

/**
 * Tells whether `@header` marks this property.
 *
 * @param program - The program to read the state from
 * @param target - The property to test
 * @returns True when the decorator was applied to `target`
 *
 * @public
 */
export function isHeader(program: Program, target: ModelProperty): boolean {
  return isHeaderInternal(program, target);
}
