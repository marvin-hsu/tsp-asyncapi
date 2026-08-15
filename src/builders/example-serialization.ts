/**
 * The pieces two example builders share.
 *
 * Schema-level examples come from the compiler's own `@example` and land in
 * a schema's `examples` keyword. Message-level examples come from this
 * library's `@messageExample` and land in a message's `examples` array. Both
 * turn a TypeSpec value into plain JSON.
 */

import {
  EncodeData,
  Program,
  Scalar,
  UnserializableValueError,
  serializeValueAsJson,
} from "@typespec/compiler";

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
