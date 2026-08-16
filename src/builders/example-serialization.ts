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
  EncodeData,
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
import { orderBySourceNodes } from "../source-order.js";

/**
 * Builds a defined, non-`undefined` `encodeAs` whose `encoding` matches none
 * of the compiler's known encodings.
 * The known encodings are `unixTimestamp`/`rfc7231` for date-times and
 * `seconds` for durations. See `ScalarSerializers` in
 * `@typespec/compiler`'s `lib/examples.js`.
 * Because the encoding never matches, every serializer falls through to its
 * un-encoded, "no `@encode` applied" representation.
 * `type` is only read back out of this value on the `duration` + `seconds`
 * branch. This `encoding` never reaches that branch, so any scalar can
 * stand in for `type` here.
 */
function neutralEncodeAs(type: Scalar): EncodeData {
  return { encoding: "rfc3339", type };
}

/**
 * Builds `serializeValueAsJson`'s handlers hook. It serves two purposes.
 *
 * First, it turns a scalar the serializer cannot represent into a thrown
 * `UnserializableValueError`, instead of a silent `undefined` return.
 * `resolveKnownScalar` returns `undefined` for an unsupported or custom
 * scalar constructor. Without this handler, an unrepresentable scalar
 * nested inside an array or object value would leave a stray `undefined`
 * buried in the result. A top-level `undefined` check would never see it.
 *
 * Second, it makes sure no `@encode` is ever applied while serializing an
 * example. This covers `@encode` declared on the scalar itself, on a
 * property of the immediate type, or on a property nested arbitrarily deep
 * inside a model or array value.
 * `buildScalarSchema` does not map `@encode` into a schema's `type`/`format`.
 * So an example that *did* apply `@encode` would encode a value the schema
 * itself does not declare. It would then fail validation against its own
 * schema.
 *
 * The compiler binds `originalFn` to the exact `encodeAs` this call
 * received. Re-invoking it with a different `encodeAs` argument has no
 * effect; the extra argument is silently ignored. `resolveKnownScalar` also
 * unconditionally re-reads the scalar's own `@encode` internally, no matter
 * what is passed in.
 * So, to skip `@encode`, this handler instead re-enters the compiler's
 * *exported* `serializeValueAsJson`, not the bound `originalFn`. It passes
 * a defined, neutral `encodeAs` (see `neutralEncodeAs`). Because
 * `encodeAs ?? result.encodeAs` favors an already-defined `encodeAs`, this
 * neutral value wins over any `@encode` that `resolveKnownScalar` would
 * otherwise pick up. This works without needing to know all the ways
 * `@encode` could reach this value.
 *
 * @internal
 */
export function makeSerializeHandlers(
  program: Program,
): Parameters<typeof serializeValueAsJson>[4] {
  return {
    serializeScalarValue: (value, type) => {
      const result = serializeValueAsJson(program, value, type, neutralEncodeAs(value.scalar));
      if (result === undefined) {
        throw new UnserializableValueError(
          `Cannot serialize scalar '${value.scalar.name}' as JSON.`,
        );
      }
      return result;
    },
  };
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
  const handlers = makeSerializeHandlers(program);
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
