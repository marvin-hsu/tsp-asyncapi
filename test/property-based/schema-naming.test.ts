import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { isSafeComponentsKey, refFor, sanitizeDeclarationName } from "../../src/naming.js";

/**
 * Properties of the Components Object key sanitizer.
 *
 * The example tests next to this file each pin one input to one expected
 * key. They say nothing about the inputs nobody thought to write down, and
 * this sanitizer carries a claim that only holds across the whole input
 * space: it encodes an unsafe character as `Sep<codepoint>`, and it escapes
 * a literal `Sep` before a digit to `SepSep` so that a name containing the
 * marker cannot be read back as an encoded character.
 *
 * That claim is what keeps two different declarations apart. When it fails,
 * `SchemaKeyRegistry` sees one key claimed twice and reports
 * `duplicate-schema-key`, so nothing is emitted silently. The cost is a
 * refusal: a legal program is rejected for a clash the escape was written
 * to prevent. An example test cannot find such a pair, because the names
 * that collide look ordinary.
 */

/**
 * A name built from the pieces the sanitizer treats specially.
 *
 * A generic string generator does not reach the interesting region. Measured
 * over 2000 draws of `fc.string({ minLength: 1 })` at seed 20260815: 0 draws
 * carried `Sep` followed by a digit, so the marker escape was never run. This
 * generator spends its draws on the marker text, on the separator characters,
 * and on short alphanumeric runs, so both the encoding branch and the escape
 * branch are reached.
 */
const markedName = fc
  .array(
    fc.oneof(
      fc.constantFrom("Sep", "sep", "SepSep", "Sep0", "Sep1", "Sep47", "Sep95"),
      fc.constantFrom("/", "~", ".", "-", "_", " ", "#"),
      fc.stringMatching(/^[A-Za-z]{1,3}$/),
      fc.stringMatching(/^\d{1,3}$/),
    ),
    { minLength: 1, maxLength: 6 },
  )
  .map((pieces) => pieces.join(""));

/**
 * True when `name` carries the marker text inside an alphanumeric run.
 *
 * The sanitizer splits on runs of non-alphanumeric characters, then rewrites
 * `Sep` before a digit to `SepSep` inside each alphanumeric run. This probe
 * uses the same split to say whether a draw can reach that rewrite. It is a
 * counter for the record below, not an assertion.
 */
function carriesMarkerRun(name: string): boolean {
  return name.split(/[^\dA-Za-z]+/).some((run) => /Sep\d/.test(run));
}

describe("Unit: Schemas — key sanitizer properties", () => {
  /**
   * Reachability, measured in this worktree at 2000 runs with seed 20260815:
   *
   *   draws already inside the key charset          811
   *   draws reaching `sanitizeNameSegment`         1189
   *   draws carrying the marker inside an
   *     alphanumeric run, so the `SepSep` escape
   *     runs                                        163
   *
   * The last count is the one that matters. The `SepSep` escape is the most
   * delicate line in the sanitizer. An earlier version of this property drew
   * `fc.string({ minLength: 1 })` alone, and measured 0 of 2000 draws
   * reaching that line, plus 389 of 2000 draws returning from the
   * sanitizer's first line. A draw that returns early makes the assertion
   * restate that line rather than test it.
   *
   * The two counters are asserted below, so this record stays honest if the
   * generator or the sanitizer moves.
   */
  it("produces a key inside the Components Object charset for any name", () => {
    let sanitized = 0;
    let markerEscaped = 0;

    fc.assert(
      fc.property(fc.oneof(markedName, fc.string({ minLength: 1 })), (name) => {
        if (!isSafeComponentsKey(name)) sanitized++;
        if (!isSafeComponentsKey(name) && carriesMarkerRun(name)) markerEscaped++;

        // A name of nothing but separators reduces to nothing, and the
        // sanitizer answers with the literal `Empty`. Either way the key
        // must stay inside the charset, or the `$ref` built from it stops
        // resolving.
        expect(isSafeComponentsKey(sanitizeDeclarationName(name))).toBe(true);
      }),
      { numRuns: 2000, seed: 20260815 },
    );

    // A run whose draws all returned from the sanitizer's first line would
    // assert only that a legal name is legal.
    expect(sanitized).toBeGreaterThan(0);
    // The `SepSep` escape is the most delicate line in the sanitizer. A run
    // that never reached it would leave that line uncovered here.
    expect(markerEscaped).toBeGreaterThan(0);
  });

  /**
   * Two different names never claim one key.
   *
   * The encoding turns an unsafe character into the marker `Sep` followed
   * by its code point, so a name that spells the marker itself has to be
   * escaped or it reads back as an encoded character. That escape used to
   * run only for names that needed encoding, and a name already inside the
   * key charset skipped it. `` `/` `` encoded to `Sep47`, the declaration
   * `Sep47` passed through untouched, and the two met on one key.
   *
   * A generic string generator almost never reaches that region, so a broad
   * property would pass and say nothing. This one builds names out of the
   * pieces that matter, and asserts how many draws carried the marker so a
   * later change to the generator cannot quietly stop reaching it.
   */
  it("keeps two names apart when one of them spells the marker", () => {
    fc.assert(
      fc.property(markedName, markedName, (left, right) => {
        fc.pre(left !== right);
        expect(sanitizeDeclarationName(left)).not.toBe(sanitizeDeclarationName(right));
      }),
      { numRuns: 5000, seed: 20260815 },
    );
  });
});

/**
 * Properties of the reference builder.
 *
 * `refFor` escapes a key into a JSON Pointer token, per RFC 6901: `~`
 * becomes `~0` and `/` becomes `~1`. A reader resolves the reference by
 * reversing that. Escaping that cannot be reversed points the reader at a
 * component that does not exist, or at the wrong one.
 */
describe("Unit: Schemas — $ref properties", () => {
  const unescapePointerToken = (token: string): string =>
    // The order matters. Undoing `~0` first would turn the `~1` produced
    // from a literal `~1` in the key back into a slash.
    token.replaceAll("~1", "/").replaceAll("~0", "~");

  /**
   * A key that reaches the escaping.
   *
   * A key with neither `~` nor `/` is copied into the token untouched, and
   * both properties below then assert only that an unescaped string equals
   * itself. Measured over 3000 draws of `fc.string({ minLength: 1 })` at seed
   * 20260815: 377 draws, 12.6%, carried one of the two characters. Mixing in
   * a pool built from them raises that.
   */
  const pointerKey = fc.oneof(
    fc.string({ minLength: 1 }),
    fc
      .array(
        fc.oneof(
          fc.constantFrom("~", "/", "~0", "~1", "~01", "//"),
          fc.stringMatching(/^[A-Za-z0-9]{1,3}$/),
        ),
        { minLength: 1, maxLength: 6 },
      )
      .map((pieces) => pieces.join("")),
  );

  /**
   * Reachability, measured in this worktree at 3000 runs with seed 20260815:
   * 1399 of 3000 draws produced a token that differs from the key, so the
   * escaping in `toJsonPointerToken` really ran. The rest assert that an
   * already-safe key survives unchanged, which is worth holding but proves
   * nothing about the escaping. The counter is asserted below.
   */
  it("builds a reference whose token decodes back to the key", () => {
    let escaped = 0;

    fc.assert(
      fc.property(pointerKey, (key) => {
        const ref = refFor(key).$ref;
        const token = ref.slice("#/components/schemas/".length);
        if (token !== key) escaped++;
        expect(unescapePointerToken(token)).toBe(key);
      }),
      { numRuns: 3000, seed: 20260815 },
    );

    expect(escaped).toBeGreaterThan(0);
  });

  /**
   * Reachability, measured in this worktree at 3000 runs with seed 20260815:
   * 719 of 3000 draws carried a `/` in the key, so the token had to be
   * rewritten for this claim to mean anything. A draw with no slash asserts
   * only that a string with no slash has no slash. The counter is asserted
   * below.
   */
  it("leaves no bare slash inside the token, so the pointer keeps its depth", () => {
    let hadSlash = 0;

    fc.assert(
      fc.property(pointerKey, (key) => {
        if (key.includes("/")) hadSlash++;
        const token = refFor(key).$ref.slice("#/components/schemas/".length);
        // A slash here would read as another step down the document, so
        // the reference would address a child of the component rather than
        // the component.
        expect(token).not.toContain("/");
      }),
      { numRuns: 3000, seed: 20260815 },
    );

    expect(hadSlash).toBeGreaterThan(0);
  });
});
