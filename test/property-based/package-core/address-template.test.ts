import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  checkAddress,
  parseAddressParameters,
} from "#core/decorators/channels/address-template.js";

/**
 * Properties of the channel address parser and the checks beside it.
 *
 * The parser and the check read one grammar. `@channel` runs the check while
 * the decorator runs. The channel builder runs the parser at emit time. So
 * the worst defect is a disagreement between the two: an address the check
 * lets through that the parser reads as something else.
 *
 * The example tests pin one input each, and neither half sees the other. A
 * property states the agreement itself, over addresses nobody wrote by hand.
 */

/** The name rule, written out here so a change to the source turns a test red. */
const LEGAL_PARAM_NAME = /^[A-Za-z0-9_-]+$/;

/** A segment of an address, before it is rendered to text. */
type Segment = { kind: "literal"; text: string } | { kind: "param"; name: string };

/**
 * Characters a literal segment may hold.
 *
 * A brace, a `?`, and a `#` are left out. Each of those is a separate
 * problem, so a literal holding one would decide the answer before the
 * property under test does.
 */
const LITERAL_CHARS = [
  "a",
  "b",
  "c",
  "X",
  "Y",
  "Z",
  "0",
  "1",
  "9",
  "/",
  ".",
  ":",
  "-",
  "_",
  "@",
  "=",
  "~",
  "ü",
  "漢",
  "\u{1f642}",
];

const literalSegment: fc.Arbitrary<Segment> = fc
  .array(fc.constantFrom(...LITERAL_CHARS), { minLength: 1, maxLength: 6 })
  .map((chars) => ({ kind: "literal", text: chars.join("") }));

/**
 * A legal parameter name.
 *
 * The pool is small on purpose. A name repeated inside one address is what
 * the order-and-repeat half of the round trip exists to check, and a wide
 * generator almost never repeats one.
 */
const legalName = fc.oneof(
  fc.constantFrom("id", "userId", "a", "B-1", "_x", "k9"),
  fc.stringMatching(/^[A-Za-z0-9_-]{1,8}$/),
);

const paramSegment: fc.Arbitrary<Segment> = legalName.map((name) => ({ kind: "param", name }));

const anySegment = fc.oneof(literalSegment, paramSegment);

const segments = fc.array(anySegment, { minLength: 1, maxLength: 6 });

/** A run of segments holding at least one parameter. */
const segmentsWithParam = fc
  .tuple(
    fc.array(anySegment, { maxLength: 3 }),
    paramSegment,
    fc.array(anySegment, { maxLength: 3 }),
  )
  .map(([before, param, after]) => [...before, param, ...after]);

function render(parts: readonly Segment[]): string {
  return parts.map((part) => (part.kind === "literal" ? part.text : `{${part.name}}`)).join("");
}

/** Lists the parameter names of the segments, in order, repeats kept. */
function names(parts: readonly Segment[]): string[] {
  return parts.filter((part) => part.kind === "param").map((part) => part.name);
}

function hasRepeat(list: readonly string[]): boolean {
  return new Set(list).size !== list.length;
}

describe("Unit: channel address — legal addresses", () => {
  it("accepts a built address, and parses back the names it was built from", () => {
    let twoOrMoreParams = 0;
    let repeatedName = 0;

    fc.assert(
      fc.property(segments, (parts) => {
        const address = render(parts);
        const expected = names(parts);
        if (expected.length >= 2) twoOrMoreParams++;
        if (hasRepeat(expected)) repeatedName++;

        expect(checkAddress(address)).toBeUndefined();
        expect(parseAddressParameters(address)).toStrictEqual(expected);
      }),
      { numRuns: 1000, seed: 20260815 },
    );

    // An address with one parameter says nothing about order, and a parser
    // that matched greedily across two expressions would still pass it.
    expect(twoOrMoreParams).toBeGreaterThan(0);
    // A parser that deduplicated names would pass every address that holds
    // each name once.
    expect(repeatedName).toBeGreaterThan(0);
  });
});

describe("Unit: channel address — rejected addresses", () => {
  it("rejects a stray brace and a nested expression", () => {
    let strayOpen = 0;
    let strayClose = 0;
    let nested = 0;

    fc.assert(
      fc.property(
        segmentsWithParam,
        fc.constantFrom("open", "close", "nest"),
        fc.nat(),
        (parts, damage, offset) => {
          let damaged: string;
          if (damage === "nest") {
            // Wraps one expression in a second pair of braces.
            const paramIndexes = parts
              .map((part, index) => ({ part, index }))
              .filter((entry) => entry.part.kind === "param")
              .map((entry) => entry.index);
            const target = paramIndexes[offset % paramIndexes.length];
            damaged = parts
              .map((part, index) =>
                index === target && part.kind === "param" ? `{{${part.name}}}` : render([part]),
              )
              .join("");
            nested++;
          } else {
            const address = render(parts);
            const at = offset % (address.length + 1);
            const brace = damage === "open" ? "{" : "}";
            damaged = `${address.slice(0, at)}${brace}${address.slice(at)}`;
            if (damage === "open") strayOpen++;
            else strayClose++;
          }

          expect(checkAddress(damaged)).toStrictEqual({
            code: "invalid-channel-address",
            messageId: "unbalanced",
          });
        },
      ),
      { numRuns: 1000, seed: 20260815 },
    );

    // The three shapes reach the check by different routes, so a run that
    // reached one of them would leave the other two untested.
    expect(strayOpen).toBeGreaterThan(0);
    expect(strayClose).toBeGreaterThan(0);
    expect(nested).toBeGreaterThan(0);
  });
});

describe("Unit: channel address — arbitrary text", () => {
  /**
   * Text no author would write.
   *
   * The pool mixes the characters both halves decide on, so the run reaches
   * an accepted address and a rejected one. A binary string alone almost
   * never holds a brace pair.
   */
  const arbitraryAddress = fc.oneof(
    fc.string({ unit: "binary" }),
    fc.string(),
    fc
      .array(
        fc.oneof(
          fc.constantFrom("{", "}", "?", "#", "{}", "{a}", "{a.b}", "{{x}}", "a/b", "", " "),
          fc.constantFrom("ü", "漢", "\u{1f642}", "\u0000"),
          fc.stringMatching(/^[A-Za-z0-9_-]{1,3}$/),
        ),
        { maxLength: 8 },
      )
      .map((pieces) => pieces.join("")),
  );

  it("answers for any text, and never accepts an address it parses a bad name from", () => {
    let accepted = 0;
    let rejected = 0;

    fc.assert(
      fc.property(arbitraryAddress, (address) => {
        const problem = checkAddress(address);
        const parsed = parseAddressParameters(address);

        if (problem === undefined) {
          accepted++;
          // The builder trusts the check, so every name the parser finds in
          // an accepted address must be one a TypeSpec property can carry.
          for (const name of parsed) {
            expect(name).toMatch(LEGAL_PARAM_NAME);
          }
        } else {
          rejected++;
        }
      }),
      { numRuns: 1000, seed: 20260815 },
    );

    // With nothing accepted the property says nothing about the parser.
    expect(accepted).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
  });
});
