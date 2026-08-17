/**
 * The pieces two example builders share.
 *
 * Schema-level examples come from the compiler's own `@example` and land in
 * a schema's `examples` keyword. Message-level examples come from this
 * library's `@messageExample` and land in a message's `examples` array. Both
 * turn a TypeSpec value into plain JSON.
 */

import {
  $example,
  Enum,
  Model,
  ModelProperty,
  Program,
  Scalar,
  Type,
  Union,
  UnionVariant,
  UnserializableValueError,
  getExamples,
  serializeValueAsJson,
} from "@typespec/compiler";
import { orderBySourceNodes } from "./source-order.js";

/**
 * Builds `serializeValueAsJson`'s handlers hook.
 *
 * It turns a scalar the serializer cannot represent into a thrown
 * `UnserializableValueError`, instead of a silent `undefined` return.
 * `resolveKnownScalar` returns `undefined` for an unsupported or custom
 * scalar constructor. Without this handler, an unrepresentable scalar
 * nested inside an array or object value would leave a stray `undefined`
 * buried in the result. A top-level `undefined` check would never see it.
 *
 * `@encode` is deliberately left to apply. The compiler resolves it while
 * serializing, so a `utcDateTime` encoded as `unixTimestamp` reaches JSON as
 * the integer it travels as. The schema says the same thing, because
 * `applyEncoding` writes the encoding into its `type`/`format`. The two have
 * to agree: an example encoded one way and described the other would fail to
 * validate against its own schema.
 *
 * The `program` is no longer needed here. The compiler binds `originalFn` to
 * everything this handler has to re-invoke, including the encoding it
 * resolved.
 *
 * @internal
 */
export function makeSerializeHandlers(): Parameters<typeof serializeValueAsJson>[4] {
  return {
    serializeScalarValue: (value, type, encodeAs, originalFn) => {
      const result = originalFn(value, type, encodeAs);
      if (result === undefined) {
        throw new UnserializableValueError(
          `Cannot serialize scalar '${value.scalar.name}' as JSON.`,
        );
      }
      return result;
    },
  };
}

/**
 * Serializes a property's own default value, written as `name?: T = value`.
 *
 * This goes through the same serializer, and the same handlers, that an
 * `@example` value goes through. A default and an example are both a concrete
 * value of the property's own type, so both must reach JSON the same way. If
 * they diverged, one of the two would end up failing to validate against the
 * schema they share.
 *
 * A value the serializer cannot represent is dropped, and `onUnserializable`
 * is called. This matches how `serializeExamples` treats the same failure.
 *
 * @param program - The program the property belongs to
 * @param prop - The property whose default value is read
 * @param onUnserializable - Called when the value cannot be serialized
 * @returns The serialized default, or `undefined` when there is none to emit
 * @internal
 */
export function serializeDefaultValue(
  program: Program,
  prop: ModelProperty,
  onUnserializable: () => void,
): unknown {
  if (prop.defaultValue === undefined) return undefined;
  try {
    // The property itself is the serialization type, not `prop.type`. That is
    // what lets the compiler apply the property's own `@encode`, so a default
    // arrives in the same encoding the schema declares. This matches how
    // `@typespec/json-schema` serializes a default.
    return serializeValueAsJson(
      program,
      prop.defaultValue,
      prop,
      undefined,
      makeSerializeHandlers(),
    );
  } catch {
    onUnserializable();
    return undefined;
  }
}

/** Every type the built-in `@example` can be applied to. */
type ExampleTarget = Model | Scalar | Enum | Union | ModelProperty | UnionVariant;

/**
 * Serializes every built-in `@example` of one target, in source order.
 *
 * Two layers emit those examples. A schema puts them in its `examples`
 * keyword, and a channel parameter puts them in its own `examples` array.
 * Both turn the same decorator into the same JSON, and both drop a value the
 * serializer cannot represent. That is one decision, so it lives here once.
 *
 * A value is dropped in two cases. The serializer may throw, which covers an
 * unsupported scalar constructor anywhere inside the value and a function
 * value. It may also return `undefined`, which carries no information the
 * caller can emit. A throw calls `onUnserializable`, so the caller reports
 * the drop the way its own layer reports diagnostics.
 *
 * The caller decides what a serialized value must look like. A schema takes
 * any JSON value, and a channel parameter keeps only strings.
 *
 * @param program - The program the target belongs to
 * @param target - The declaration or property the examples were written on
 * @param valueType - The type each example value is serialized against
 * @param onUnserializable - Called with the source-order index of each
 * dropped example
 * @returns The serialized values, in source order, without the dropped ones
 * @internal
 */
export function serializeExamples(
  program: Program,
  target: ExampleTarget,
  valueType: Type,
  onUnserializable: (index: number) => void,
): unknown[] {
  // `@example`'s own `extern dec` declaration legally targets `UnionVariant`
  // (see `decorators.tsp`). But `getExamples`'s exported TS signature omits
  // it. This is a typing gap in `@typespec/compiler` itself, not a real
  // runtime restriction. Its state is stored generically over `Type`. The
  // cast below only widens the static type to match what the decorator
  // already allows.
  const recorded = getExamples(program, target as Model | Scalar | Enum | Union | ModelProperty);
  if (recorded.length === 0) return [];
  const nodes = target.decorators
    .filter((decorator) => decorator.decorator === $example)
    .map((decorator) => decorator.node);
  const handlers = makeSerializeHandlers();
  const values: unknown[] = [];
  orderBySourceNodes(program, nodes, recorded).forEach((example, index) => {
    let serialized: unknown;
    try {
      serialized = serializeValueAsJson(program, example.value, valueType, undefined, handlers);
    } catch {
      // An example that carries no usable information is dropped rather than
      // left to crash the whole emit. The compiler's own duration serializer,
      // for one, throws a plain `RangeError` from `Temporal.Duration.from` on
      // a malformed `duration.fromISO(...)` value it never validates.
      onUnserializable(index);
      return;
    }
    if (serialized !== undefined) values.push(serialized);
  });
  return values;
}
