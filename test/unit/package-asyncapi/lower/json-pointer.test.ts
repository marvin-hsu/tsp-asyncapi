import { describe, it, expect } from "vitest";
import { resolvesInDocument } from "#emitter/lower/json-pointer.js";
import { COMPONENTS_SCHEMA_REF_PREFIX } from "#core/constants.js";

/**
 * The array-index rule of the reference reader, one token at a time.
 *
 * RFC 6901 spells an array index as `0` or a digit run with no leading zero.
 * A naive reader that passes the token to `Number` accepts far more:
 * `""` and `" "` both become 0, and `"01"`, `"1.0"`, `"+1"`, `"0x1"`, and
 * `"1e0"` all become 1. The corpus case `raw-ref-array-index` pins the same
 * rule end to end.
 *
 * Every case here expects a literal `true` or `false`, an oracle that cannot
 * drift. The `index >= length` check is a fast path, not a separate rule:
 * reading past the end of an array yields `undefined`, and the walk already
 * stops on `undefined`. `index > length` would answer the same way.
 */
describe("Unit: the array-index rule of the reference reader", () => {
  /** Wraps an array where a raw schema would carry one. */
  function arrayDoc(items: unknown[]): unknown {
    return { components: { schemas: { Payload: { oneOf: items } } } };
  }

  const arrayRef = (token: string): string =>
    `${COMPONENTS_SCHEMA_REF_PREFIX}Payload/oneOf/${token}`;

  /** Three members, so index 2 is the last one that resolves. */
  const THREE = ["a", "b", "c"];

  it.each(["", " ", "01", "1.0", "+1", "0x1", "1e0"])(
    "rejects the array index %j, which the specification does not spell",
    (token) => {
      expect(resolvesInDocument(arrayDoc(THREE), arrayRef(token))).toBe(false);
    },
  );

  // `length` and `constructor` are load-bearing: a reader that indexed the
  // array by the raw token instead of the parsed number would answer for
  // both. No other token here catches that mistake, since `Number("x")` is
  // `NaN` and `items[NaN]` is `undefined` regardless.
  it.each(["length", "constructor", "__proto__", "x", "abc", "1.5", "-0.5", "NaN", "Infinity"])(
    "rejects the array index %j, which names no member of an array",
    (token) => {
      expect(resolvesInDocument(arrayDoc(THREE), arrayRef(token))).toBe(false);
    },
  );

  it.each([
    { token: "0", resolves: true },
    { token: "1", resolves: true },
    { token: "2", resolves: true },
    // The first token past the end, and one further out.
    { token: "3", resolves: false },
    { token: "9", resolves: false },
    // A negative index is not a token the specification spells, so it is
    // refused by the charset rather than by the bounds.
    { token: "-1", resolves: false },
  ])("reads index $token of a three-member array as $resolves", ({ token, resolves }) => {
    expect(resolvesInDocument(arrayDoc(THREE), arrayRef(token))).toBe(resolves);
  });

  it("holds no index at all when the array is empty", () => {
    expect(resolvesInDocument(arrayDoc([]), arrayRef("0"))).toBe(false);
  });

  // The walk stops on `undefined`, and only on `undefined`. A member that is
  // merely falsy still resolves. Widening the stop condition to `!current`
  // would break this case.
  it.each([null, 0, "", false])("resolves a pointer to the falsy member %j", (member) => {
    expect(resolvesInDocument(arrayDoc([member]), arrayRef("0"))).toBe(true);
  });
});
