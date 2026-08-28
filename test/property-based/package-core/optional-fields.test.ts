import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { text } from "#core/optional-fields.js";

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

describe("Unit: optional fields — text", () => {
  /**
   * A body that is already what `text` should keep: not empty, and carrying no
   * whitespace at either end. Inner whitespace is drawn on purpose — it is the
   * part the outer rule must leave alone, and a `trim` written as a global
   * replace would eat it.
   */
  const core = fc.oneof(
    fc
      .string({ minLength: 1 })
      .map((text) => text.trim())
      .filter((text) => text !== ""),
    fc
      .tuple(fc.stringMatching(/^[a-z]{1,6}$/), whitespace, fc.stringMatching(/^[a-z]{1,6}$/))
      .map(([left, space, right]) => `${left}${space}${right}`),
  );

  /**
   * The expected answer is the drawn body itself, never computed from the
   * input. An oracle that trimmed the input here would restate the rule the
   * module already states, so a change to that rule could move both sides
   * together and hide a regression.
   */
  it("holds the drawn body whatever whitespace is wrapped around it", () => {
    let padded = 0;
    let bare = 0;

    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        whitespaceRun,
        core,
        whitespaceRun,
        (key, before, body, after) => {
          if (before !== "" || after !== "") padded++;
          else bare++;

          const result: Record<string, unknown> = text(key, `${before}${body}${after}`);

          // The result is spread into an object under construction, so any
          // second key would land in the document unannounced.
          expect(Object.keys(result)).toEqual([key]);
          expect(result[key]).toBe(body);
        },
      ),
      { numRuns: 2000, seed: 20260815 },
    );

    // Without padding the property says nothing about the trimming.
    expect(padded).toBeGreaterThan(0);
    expect(bare).toBeGreaterThan(0);
  });

  it("spreads nothing for text that is only whitespace", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), whitespaceRun, (key, blank) => {
        // An empty run is the empty string, which reaches the same answer.
        expect(text(key, blank)).toEqual({});
      }),
      { numRuns: 2000, seed: 20260815 },
    );
  });
});
