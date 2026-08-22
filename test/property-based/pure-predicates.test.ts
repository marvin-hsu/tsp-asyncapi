import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { missingFields } from "../../src/decorators/bindings/fields.js";
import { localRef } from "../../src/decorators/messages/raw-schema.js";
import { isPlainObject } from "../../src/marshalled-values.js";
import { isSameApplication, SourcePosition } from "../../src/source-order.js";
import { LOCAL_REF_PREFIX } from "../../src/constants.js";

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

  it("names exactly the required fields that say nothing", () => {
    let sawNull = 0;
    let sawUndefined = 0;
    let sawBlank = 0;
    let sawFalse = 0;
    let sawZero = 0;

    fc.assert(
      fc.property(writtenObject, requiredList, (value, required) => {
        const expected = required.filter((field) => {
          const written = value[field];
          if (written === null || written === undefined) return true;
          return typeof written === "string" && written.trim() === "";
        });

        for (const field of required) {
          const written = value[field];
          if (written === null) sawNull++;
          else if (written === undefined) sawUndefined++;
          else if (typeof written === "string" && written.trim() === "") sawBlank++;
          else if (written === false) sawFalse++;
          else if (written === 0) sawZero++;
        }

        const answer = missingFields(value, required);

        // The answer is the set, in the order the caller asked for it.
        expect(answer).toStrictEqual(expected);
        // Every name comes from `required`, and no name repeats.
        expect(new Set(answer).size).toBe(answer.length);
        for (const field of answer) {
          expect(required).toContain(field);
        }
        // A field that carries a value is never reported. `false` and `0`
        // carry a value.
        for (const field of required) {
          const written = value[field];
          if (written === false || written === 0) {
            expect(answer).not.toContain(field);
          }
        }
      }),
      { numRuns: 2000, seed: 20260815 },
    );

    // Each kind has its own line in the predicate, or its own mutation. A
    // run that missed one would leave that line untested.
    expect(sawNull).toBeGreaterThan(0);
    expect(sawUndefined).toBeGreaterThan(0);
    expect(sawBlank).toBeGreaterThan(0);
    expect(sawFalse).toBeGreaterThan(0);
    expect(sawZero).toBeGreaterThan(0);
  });
});

describe("Unit: localRef — the reference form it accepts", () => {
  /** A reference that points into this document. */
  const localReference = fc
    .string()
    .map((tail) => `${LOCAL_REF_PREFIX}${tail}`)
    .map((ref) => ({ $ref: ref }));

  /** A reference the predicate must refuse, plus the shapes around one. */
  const rejectedShape = fc.oneof(
    fc.constantFrom<Record<string, unknown>>(
      // A bare fragment names the whole document, not a schema in it.
      { $ref: "#" },
      { $ref: "#components" },
      { $ref: "#anchor" },
      { $ref: "http://example.com/schema.json" },
      { $ref: "./other.json#/components/schemas/Order" },
      { $ref: "components/schemas/Order" },
      { $ref: "" },
      { $ref: 5 },
      { $ref: null },
      { $ref: { $ref: "#/x" } },
      { $ref: ["#/x"] },
      { type: "object" },
      {},
    ),
    fc.constantFrom<unknown>(null, "#/components/schemas/Order", 7, true, undefined, [
      { $ref: "#/x" },
    ]),
    fc.anything({ withDate: true, withMap: true, withSet: true, withBigInt: true }),
  );

  it("reads back only a fragment that opens with the local prefix", () => {
    let accepted = 0;
    let rejected = 0;
    let bareHash = 0;
    let nonStringRef = 0;
    let notAnObject = 0;

    fc.assert(
      fc.property(
        fc.oneof(fc.constant(undefined), fc.string({ maxLength: 3 })),
        fc.oneof(localReference, rejectedShape),
        (extra, base) => {
          // A sibling key must not change the answer.
          const value =
            isPlainObject(base) && extra !== undefined ? { ...base, title: extra } : base;

          const held = isPlainObject(value) ? value.$ref : undefined;
          const expected =
            typeof held === "string" && held.startsWith(LOCAL_REF_PREFIX) ? held : undefined;

          if (expected !== undefined) accepted++;
          else rejected++;
          if (held === "#") bareHash++;
          if (isPlainObject(value) && "$ref" in value && typeof held !== "string") nonStringRef++;
          if (!isPlainObject(value)) notAnObject++;

          expect(localRef(value)).toBe(expected);
        },
      ),
      { numRuns: 2000, seed: 20260815 },
    );

    // Without both answers the property fixes nothing.
    expect(accepted).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
    // A prefix relaxed to `#` is the mutation this case turns red.
    expect(bareHash).toBeGreaterThan(0);
    // The type test and the object test each need their own case.
    expect(nonStringRef).toBeGreaterThan(0);
    expect(notAnObject).toBeGreaterThan(0);
  });
});

describe("Unit: isPlainObject — what counts as a JSON object", () => {
  /** A value paired with the answer its category demands. */
  /**
   * The predicate looks only at the shape's category, never inside it, so
   * category representatives are the whole input space: a sampled dictionary
   * exercises no line a written-out `{ a: 1 }` does not. The `Date` and `Map`
   * rows pin today's behavior — no marshalled argument can carry either, so
   * the emitter never asks this question of them.
   */
  it.each([
    { name: "an object literal", value: { a: 1 }, plain: true },
    { name: "an object built from entries", value: Object.fromEntries([["a", 1]]), plain: true },
    { name: "an empty object", value: {}, plain: true },
    { name: "an array", value: [1, 2], plain: false },
    { name: "an empty array", value: [], plain: false },
    { name: "null", value: null, plain: false },
    { name: "undefined", value: undefined, plain: false },
    { name: "a string", value: "text", plain: false },
    { name: "a number", value: 7, plain: false },
    { name: "a boolean", value: true, plain: false },
    { name: "a Date", value: new Date(0), plain: true },
    { name: "a Map", value: new Map([["a", 1]]), plain: true },
  ])("answers $plain for $name", ({ value, plain }) => {
    expect(isPlainObject(value)).toBe(plain);

    // The predicate is a type guard, so a `true` answer must let the caller
    // read keys off the value.
    if (isPlainObject(value)) {
      expect(() => Object.entries(value)).not.toThrow();
    }
  });
});

describe("Unit: isSameApplication — the identity of one application", () => {
  /**
   * The whole domain, written out: four file names and nine offsets. The
   * predicate reads nothing else, so thirty-six positions are every input it
   * can distinguish, and the loops below visit all of their pairs — complete
   * where a sampler is a lucky subset, and free of the seed that once decided
   * whether the transitive premise was reached at all.
   */
  const FILES = ["main.tsp", "lib.tsp", "a/b.tsp", ""] as const;
  const POSITIONS: SourcePosition[] = FILES.flatMap((file) =>
    Array.from({ length: 9 }, (_, pos) => ({ file, pos })),
  );

  it("answers true exactly when both the file and the offset agree", () => {
    for (const a of POSITIONS) {
      for (const b of POSITIONS) {
        // Agreement of the parts is the specification; the predicate is the
        // implementation under test.
        expect(isSameApplication(a, b)).toBe(a.file === b.file && a.pos === b.pos);
      }
    }
  });

  it("holds an equivalence relation over source positions", () => {
    for (const left of POSITIONS) {
      // Reflexive, on a copy: the same place, not the same object.
      expect(isSameApplication(left, { ...left })).toBe(true);
      for (const right of POSITIONS) {
        // Symmetric: the swapped call is the claim.
        expect(isSameApplication(left, right)).toBe(isSameApplication(right, left));
      }
    }
    // Transitivity holds by the exhaustive check above: a relation that
    // equals component-wise agreement is transitive by construction, and
    // every pair was compared against that specification.
  });
});
