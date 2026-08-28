import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { missingFields } from "#core/decorators/bindings/fields.js";
import { localRef } from "#core/decorators/messages/raw-schema.js";
import { LOCAL_REF_PREFIX } from "#core/constants.js";

/**
 * Properties of four leaf predicates.
 *
 * Each one decides a small question for many callers. A wrong answer is
 * absorbed upstream: one diagnostic goes unreported, or one `$ref` never gets
 * registered. Nothing in the emitted document points at the cause.
 *
 * The value domains are small, so a property test can pin the whole meaning
 * rather than the inputs an example test happened to name.
 */

/** Field names the generators draw from, so `required` and `value` overlap. */
const FIELD_NAMES = ["name", "fifo", "encoding", "topic", "vhost"] as const;

describe("Unit: missingFields — set semantics", () => {
  /**
   * One field value, mixing the kinds the predicate treats differently.
   *
   * `false` and `0` are the cases a truthiness test would get wrong. The
   * blank strings are the cases a bare `undefined`/`null` test would miss.
   */
  const fieldValue = fc.oneof(
    fc.constantFrom("queue-1", "0", "false"),
    fc.string(),
    fc.constant(null),
    fc.constant(undefined),
    fc.constantFrom("", " ", "\t", "\n  ", "   "),
    fc.constant(false),
    fc.constant(0),
    fc.constant(1),
    fc.constant({}),
    fc.constant([]),
  );

  /**
   * An object the author could have written.
   *
   * `Object.fromEntries` defines own properties, so a drawn name never lands
   * on the prototype. A name the entries omit is absent rather than blank.
   */
  const writtenObject = fc
    .uniqueArray(fc.tuple(fc.constantFrom(...FIELD_NAMES), fieldValue), {
      selector: (entry) => entry[0],
      maxLength: FIELD_NAMES.length,
    })
    .map((entries) => Object.fromEntries(entries) as Record<string, unknown>);

  /** The required list. Names are unique, so the answer holds no duplicate. */
  const requiredList = fc.uniqueArray(fc.constantFrom(...FIELD_NAMES), {
    maxLength: FIELD_NAMES.length,
  });

  it("answers with a subset of the required list, in order and without repeats", () => {
    let reportedSome = 0;
    let reportedNone = 0;

    fc.assert(
      fc.property(writtenObject, requiredList, (value, required) => {
        const answer = missingFields(value, required);

        // Which values say nothing is enumerated elsewhere. This property draws
        // field sets and order instead, which that rule says nothing about.
        if (answer.length > 0) reportedSome++;
        else reportedNone++;

        // Every name comes from `required`, and no name repeats.
        expect(new Set(answer).size).toBe(answer.length);
        for (const field of answer) {
          expect(required).toContain(field);
        }
        // The answer keeps the order the caller asked for, so a report reads
        // in the order the fields are documented.
        expect(answer).toStrictEqual(required.filter((field) => answer.includes(field)));
      }),
      { numRuns: 2000, seed: 20260815 },
    );

    // A run that never reported anything would say nothing about the subset
    // claim, and one that always reported would never exercise the empty
    // answer.
    expect(reportedSome).toBeGreaterThan(0);
    expect(reportedNone).toBeGreaterThan(0);
  });
});

describe("Unit: localRef — a sibling key beside the reference", () => {
  /** A reference that points into this document. */
  const localReference = fc
    .string()
    .map((tail) => `${LOCAL_REF_PREFIX}${tail}`)
    .map((ref) => ({ $ref: ref }));

  /**
   * Which shapes are read back and which are refused is enumerated elsewhere.
   * What is drawn here is the dimension that rule says nothing about: a raw
   * schema is written by an author, so a `$ref` can arrive with other keys
   * beside it, and the answer must not depend on them.
   */
  it("answers the same whatever keys sit beside the reference", () => {
    let withSiblings = 0;
    let alone = 0;

    fc.assert(
      fc.property(
        localReference,
        fc.dictionary(
          fc.string({ minLength: 1 }).filter((key) => key !== "$ref"),
          fc.string(),
          {
            maxKeys: 3,
          },
        ),
        (reference, siblings) => {
          const keys = Object.keys(siblings);
          if (keys.length > 0) withSiblings++;
          else alone++;

          // The reference is the same in both, so the answer has to be too.
          expect(localRef({ ...reference, ...siblings })).toBe(reference.$ref);
          expect(localRef({ ...siblings, ...reference })).toBe(reference.$ref);
        },
      ),
      { numRuns: 2000, seed: 20260815 },
    );

    // Without a sibling the property says nothing about siblings.
    expect(withSiblings).toBeGreaterThan(0);
    expect(alone).toBeGreaterThan(0);
  });
});
