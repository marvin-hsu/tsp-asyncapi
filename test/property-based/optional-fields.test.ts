import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { present, text, trimmed } from "../../src/optional-fields.js";

/**
 * Properties of the one rule that decides whether a field is emitted.
 *
 * Every optional field in the document passes through these three functions.
 * A mistake here is silent: an empty field appears where the author wrote
 * nothing, or a real `false` disappears. The example tests pin the values
 * someone thought of. These properties walk the whole value range instead.
 */

/** Whitespace the runtime trims, including the characters no author types. */
const whitespace = fc.constantFrom(" ", "\t", "\n", "\r", "\f", "\v", " ", " ", "﻿");

/** A run of whitespace, empty runs included. */
const whitespaceRun = fc.array(whitespace, { maxLength: 4 }).map((parts) => parts.join(""));

/**
 * Text that reaches both answers of `trimmed`.
 *
 * A plain generated string is almost never blank and almost never carries an
 * outer space, so it exercises one line of the function. The padded and the
 * all-blank forms reach the other.
 */
const authorText = fc.oneof(
  fc.string({ unit: "binary" }),
  whitespaceRun,
  fc
    .tuple(whitespaceRun, fc.string({ minLength: 1 }), whitespaceRun)
    .map(([before, body, after]) => `${before}${body}${after}`),
);

describe("Unit: optional fields — trimmed", () => {
  it("settles after one pass and never answers with blank or padded text", () => {
    let allBlank = 0;
    let trailingBlank = 0;

    fc.assert(
      fc.property(fc.oneof(authorText, fc.constant(undefined)), (value) => {
        const once = trimmed(value);
        if (value !== undefined && value !== "" && once === undefined) allBlank++;
        if (once !== undefined && /\s$/.test(value ?? "")) trailingBlank++;

        // A second pass has nothing left to remove, so callers may apply the
        // rule wherever it is convenient.
        expect(trimmed(once)).toBe(once);
        if (once !== undefined) {
          expect(once).not.toBe("");
          expect(once).toBe(once.trim());
        }
      }),
      { numRuns: 2000, seed: 20260815 },
    );

    // Text that is nothing but whitespace is the input that separates this
    // rule from a plain `!== undefined` test.
    expect(allBlank).toBeGreaterThan(0);
    // A trailing run is the half a `trimStart` would keep.
    expect(trailingBlank).toBeGreaterThan(0);
  });
});

describe("Unit: optional fields — text", () => {
  /**
   * What the field should hold, stated without the code under test.
   *
   * Reading the answer from `trimmed` would make the property compare the
   * module against itself, and a change to the blank rule would move both
   * sides together.
   */
  function expectedField(value: string | undefined): string | undefined {
    const body = (value ?? "").trim();
    return body.length === 0 ? undefined : body;
  }

  it("spreads one entry or none, and holds the trimmed text", () => {
    let omitted = 0;
    let kept = 0;

    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.oneof(authorText, fc.constant(undefined)),
        (key, value) => {
          const result: Record<string, unknown> = text(key, value);
          const keys = Object.keys(result);
          const expected = expectedField(value);

          // The result is spread into an object under construction, so any
          // second key would land in the document unannounced.
          expect(keys.length).toBeLessThanOrEqual(1);
          if (expected === undefined) {
            omitted++;
            expect(keys).toEqual([]);
          } else {
            kept++;
            expect(keys).toEqual([key]);
            expect(result[key]).toBe(expected);
          }
        },
      ),
      { numRuns: 2000, seed: 20260815 },
    );

    // Both answers need a witness. A run that only kept fields would say
    // nothing about the omission the rule exists for.
    expect(omitted).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(0);
  });
});

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
