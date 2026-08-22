import { describe, it, expect } from "vitest";
import { present } from "../../src/optional-fields.js";

/**
 * The finite inputs of `present`, written out.
 *
 * `present` is the one rule that decides whether an optional field with a
 * value reaches the document. The two enumerable spaces below used to be
 * sampled as properties; the open-ended halves of the same module — the
 * idempotence of `trimmed` and the spread shape of `text` — remain properties
 * in `test/property-based/optional-fields.test.ts`.
 */
describe("Unit: optional fields — present", () => {
  /**
   * The falsy values are the whole point: a truthiness test drops exactly
   * these, and the set is finite, so it is enumerated rather than drawn. Two
   * truthy values ride along to show presence is not the inverse mistake.
   * `NaN` and `-0` are compared through `Object.is`, because both are values
   * an author may write and both have to survive.
   */
  it.each([false, 0, "", null, Number.NaN, -0, 0n, "text", 7])(
    "keeps %p, which is present even when falsy",
    (value) => {
      const result: Record<string, unknown> = present("key", value);
      expect(Object.keys(result)).toEqual(["key"]);
      expect(Object.is(result.key, value)).toBe(true);
    },
  );

  /**
   * The six names below are the input space of this claim: every member
   * `Object.prototype` already carries, where a plain assignment does
   * something other than adding a property. The value is an object on
   * purpose — only an object value makes the inherited `__proto__` setter
   * act, so that pairing is the one that separates the two ways of writing
   * the key.
   */
  it.each(["__proto__", "constructor", "prototype", "toString", "hasOwnProperty", "valueOf"])(
    "writes %j as an own property and leaves the prototype alone",
    (key) => {
      const value = { type: "string" };

      const result: Record<string, unknown> = present(key, value);
      // An assignment would hand `__proto__` to the inherited setter, which
      // moves the prototype and defines no property at all.
      expect(Object.getOwnPropertyNames(result)).toEqual([key]);
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(Object.is(result[key], value)).toBe(true);
    },
  );
});
