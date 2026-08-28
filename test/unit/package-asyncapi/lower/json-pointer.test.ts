import { describe, it, expect } from "vitest";
import { resolvesInDocument } from "#emitter/lower/json-pointer.js";
import { COMPONENTS_SCHEMA_REF_PREFIX } from "#core/constants.js";

/**
 * The array-index rule of the reference reader, one token at a time.
 *
 * RFC 6901 spells an array index as `0` or a digit run with no leading zero.
 * The reader used to pass the token to `Number`, which accepts much more:
 * `""` and `" "` both became 0, and `"01"`, `"1.0"`, `"+1"`, `"0x1"` and
 * `"1e0"` all became 1. So a raw schema carrying `#/…/oneOf/0x1` was reported
 * as resolving, while a reader that follows the specification finds nothing
 * there. The corpus case `raw-ref-array-index` pins the same rule end to end.
 *
 * The whole rule is enumerated here. It used to be split with a property in
 * `test/property-based/json-pointer.test.ts`, which drew a token against a
 * drawn array and computed its answer from a copy of the reader's own
 * `ARRAY_INDEX`. That copy was character-for-character the constant it was
 * checking, and the two lists it drew from were the tokens below, so the
 * property was this table shuffled -- with two of its four claims reached by
 * luck rather than by construction. Every expectation here is a literal
 * `true` or `false`, which is the one oracle that cannot drift.
 *
 * The bounds are enumerable too, and the reason is worth writing down: the
 * `index >= length` check is a fast path rather than a decision, because
 * reading past the end of an array yields `undefined` and the walk stops on
 * `undefined` anyway. Turning it into `index > length` changes no answer.
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

  // `length` and `constructor` are the load-bearing pair. A reader that
  // indexed the array by the raw token instead of by the number would answer
  // for both, and no other token here would catch it: `Number("x")` is `NaN`,
  // `NaN >= 3` is false, and `items[NaN]` is `undefined`, so plain garbage
  // gets refused either way. The garbage is kept because a token is not
  // required to look like anything in particular.
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
  // merely falsy is a member, so the pointer that names it resolves. This is
  // the claim that fails if the stop condition is ever widened to `!current`,
  // and the property that used to cover it only did so on the runs where a
  // falsy member happened to be drawn in range.
  it.each([null, 0, "", false])("resolves a pointer to the falsy member %j", (member) => {
    expect(resolvesInDocument(arrayDoc([member]), arrayRef("0"))).toBe(true);
  });
});
