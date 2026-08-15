import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  isSafeComponentsKey,
  refFor,
  sanitizeDeclarationName,
} from "../../../src/builders/schemas/schema-naming.js";

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
 * That claim is what `duplicate-schema-key` rests on. Two declaration names
 * that produce one key put two types under a single component, and the
 * emitter reports nothing, because the collision it detects is a collision
 * of keys. Silence is the failure mode, which is why the input space is
 * worth searching rather than sampling.
 */
describe("Unit: Schemas — key sanitizer properties", () => {
  it("produces a key inside the Components Object charset for any name", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (name) => {
        // A name of nothing but separators reduces to nothing, and the
        // sanitizer answers with the literal `Empty`. Either way the key
        // must stay inside the charset, or the `$ref` built from it stops
        // resolving.
        expect(isSafeComponentsKey(sanitizeDeclarationName(name))).toBe(true);
      }),
      { numRuns: 2000 },
    );
  });

  /**
   * A known defect, recorded rather than hidden.
   *
   * `sanitizeDeclarationName` returns a name unchanged as soon as it is
   * already inside the key charset. The escape that turns `Sep` before a
   * digit into `SepSep` lives further in, so a name that is already legal
   * and happens to spell the marker never meets it:
   *
   *   "/"     -> "Sep47"
   *   "Sep47" -> "Sep47"
   *
   * A model written as `` `/` `` and a model written as `Sep47` therefore
   * claim one `components.schemas` key. Any character behaves the same way:
   * `` `~` `` collides with `Sep126`.
   *
   * A generic string generator almost never reaches this region, so a
   * broad injectivity property would pass and say nothing. This generator
   * builds names out of the pieces that matter, so the search spends its
   * runs where the collision lives. The seed is fixed so the result does
   * not move between runs.
   *
   * `it.fails` records the defect without turning the suite red. Fixing the
   * sanitizer makes this test fail. That is the signal to drop `.fails`,
   * which turns this into the injectivity property the sanitizer claims.
   */
  it.fails("does not yet keep names apart when one of them spells the marker", () => {
    const piece = fc.oneof(
      fc.constantFrom("Sep", "sep", "SepSep", "Sep0", "Sep1", "Sep47", "Sep95"),
      fc.constantFrom("/", "~", ".", "-", "_", " ", "#"),
      fc.stringMatching(/^[A-Za-z]{1,3}$/),
      fc.stringMatching(/^\d{1,3}$/),
    );
    const marked = fc.array(piece, { minLength: 1, maxLength: 6 }).map((ps) => ps.join(""));

    fc.assert(
      fc.property(marked, marked, (left, right) => {
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

  it("builds a reference whose token decodes back to the key", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (key) => {
        const ref = refFor(key).$ref;
        const token = ref.slice("#/components/schemas/".length);
        expect(unescapePointerToken(token)).toBe(key);
      }),
      { numRuns: 3000 },
    );
  });

  it("leaves no bare slash inside the token, so the pointer keeps its depth", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (key) => {
        const token = refFor(key).$ref.slice("#/components/schemas/".length);
        // A slash here would read as another step down the document, so
        // the reference would address a child of the component rather than
        // the component.
        expect(token).not.toContain("/");
      }),
      { numRuns: 3000 },
    );
  });
});
