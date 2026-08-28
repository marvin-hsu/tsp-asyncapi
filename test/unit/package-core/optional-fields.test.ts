import { describe, it, expect } from "vitest";
import { present, trimmed } from "#core/optional-fields.js";

/**
 * The finite inputs of `present`, written out.
 *
 * `present` is the one rule that decides whether an optional field with a
 * value reaches the document. The two enumerable spaces below are checked
 * here as fixed tables. The open-ended halves of the same module — the
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

/**
 * What `trimmed` answers for each way whitespace can sit in the text.
 *
 * The rule has two halves: strip the outer whitespace, and answer `undefined`
 * when nothing is left. The characters JavaScript's `trim` removes are a
 * closed set, and a run can sit in three places, so the table below is the
 * whole of what the rule decides.
 *
 * The dimension that stays open is whitespace *inside* the text. The `text`
 * property next door draws bodies and compares the spread entry, and it is
 * what fails when `trim` is written as a global `replaceAll`.
 */
describe("Unit: optional fields — trimmed", () => {
  const RUNS = [" ", "\t", "\n", "\r", "\f", "\v", "\u00a0", "\u2028", "\ufeff"];

  it.each(RUNS)("strips %j from both ends and keeps the body", (space) => {
    expect(trimmed(`${space}orders${space}`)).toBe("orders");
    expect(trimmed(`${space}orders`)).toBe("orders");
    expect(trimmed(`orders${space}`)).toBe("orders");
  });

  it.each(RUNS)("answers undefined for text that is only %j", (space) => {
    expect(trimmed(space)).toBeUndefined();
    expect(trimmed(space.repeat(3))).toBeUndefined();
  });

  it.each([
    { kind: "undefined", value: undefined },
    { kind: "the empty string", value: "" },
  ])("answers undefined for $kind", ({ value }) => {
    expect(trimmed(value)).toBeUndefined();
  });

  it("keeps whitespace that sits inside the text", () => {
    // The one dimension the outer rule says nothing about. The `text`
    // property next door draws bodies for the same reason.
    expect(trimmed("  two words  ")).toBe("two words");
  });
});
