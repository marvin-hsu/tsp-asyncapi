import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  channelMessageRef,
  componentsSchemaRef,
  resolvesInDocument,
} from "../../src/lower/json-pointer.js";
import { COMPONENTS_SCHEMA_REF_PREFIX } from "../../src/constants.js";

/**
 * Properties of the reference builders and the reference reader.
 *
 * A `$ref` is the only link between two places in an emitted document. The
 * builders escape a key into a pointer token, and `resolvesInDocument` reads
 * a token back into a key. The two halves must agree for every key, not for
 * the keys someone thought to write an example for.
 *
 * The example tests pin single inputs. The end-to-end baseline checks that
 * every `$ref` the emitter writes resolves, but the compiler never hands it
 * a key holding `~`, `/`, `%`, or a character outside ASCII. Those keys are
 * exactly where the escaping decides the answer, so they are generated here.
 */

/**
 * A key that reaches the escaping.
 *
 * A key with neither `~` nor `/` is copied into the token untouched, and a
 * round-trip over such a key asserts only that a string equals itself. This
 * generator mixes plain strings with a pool built from the characters the
 * escaping and the percent-decoding both care about, plus text outside
 * ASCII, which no TypeSpec program in the test suite produces.
 */
const pointerKey = fc.oneof(
  fc.string({ minLength: 1 }),
  fc
    .array(
      fc.oneof(
        fc.constantFrom("~", "/", "~0", "~1", "~01", "//", "%", "%2F", "%41"),
        fc.constantFrom("ü", "漢", "日本語", "\u{1f642}"),
        fc.stringMatching(/^[A-Za-z0-9]{1,3}$/),
      ),
      { minLength: 1, maxLength: 6 },
    )
    .map((pieces) => pieces.join("")),
);

/** True when the key needs escaping, so the token differs from the key. */
const needsEscaping = (key: string): boolean => key.includes("~") || key.includes("/");

/**
 * Builds a document holding one schema under `key`.
 *
 * `Object.fromEntries` defines an own property, so a key such as
 * `__proto__` lands on the map rather than on its prototype.
 */
function schemaDoc(key: string): unknown {
  return { components: { schemas: Object.fromEntries([[key, {}]]) } };
}

describe("Unit: JSON Pointer — round-trip properties", () => {
  it("resolves the reference it built for any schema key", () => {
    let escaped = 0;

    fc.assert(
      fc.property(pointerKey, (key) => {
        if (needsEscaping(key)) escaped++;
        expect(resolvesInDocument(schemaDoc(key), componentsSchemaRef(key))).toBe(true);
      }),
      { numRuns: 2000, seed: 20260815 },
    );

    // A run of keys that all pass through unescaped would assert that the
    // reader finds a key nobody rewrote.
    expect(escaped).toBeGreaterThan(0);
  });

  it("resolves the two-token reference it built for a channel message", () => {
    let bothEscaped = 0;

    fc.assert(
      fc.property(pointerKey, pointerKey, (channelId, messageKey) => {
        if (needsEscaping(channelId) && needsEscaping(messageKey)) bothEscaped++;
        const doc = {
          channels: Object.fromEntries([
            [channelId, { messages: Object.fromEntries([[messageKey, {}]]) }],
          ]),
        };
        expect(resolvesInDocument(doc, channelMessageRef(channelId, messageKey))).toBe(true);
      }),
      { numRuns: 2000, seed: 20260815 },
    );

    // Escaping one token and forgetting the other is the mistake this
    // property exists to catch, so both tokens have to need it.
    expect(bothEscaped).toBeGreaterThan(0);
  });
});

describe("Unit: JSON Pointer — reader properties", () => {
  /** Undoes the escaping, in the order RFC 6901 requires. */
  const unescapeToken = (token: string): string =>
    token.replaceAll("~1", "/").replaceAll("~0", "~");

  /** Percent-decodes, or answers with the text itself. */
  function safeDecode(text: string): string {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  }

  /**
   * A key drawn against a document that holds another key.
   *
   * The pool carries the names every object inherits. A reader that stepped
   * through the prototype chain would report those as resolved, and no
   * emitted document ever refers to one.
   */
  const inheritedNames = [
    "toString",
    "valueOf",
    "constructor",
    "hasOwnProperty",
    "__proto__",
    "isPrototypeOf",
  ];
  const inheritedName = fc.constantFrom(...inheritedNames);

  it("reports no hit for a key the document does not hold", () => {
    let inherited = 0;

    fc.assert(
      fc.property(pointerKey, fc.oneof(pointerKey, inheritedName), (held, asked) => {
        const ref = componentsSchemaRef(asked);
        const token = ref.slice(COMPONENTS_SCHEMA_REF_PREFIX.length);
        // Both forms of the asked key must miss the held one, because the
        // reader tries the text and its percent-decoding.
        fc.pre(asked !== held && unescapeToken(safeDecode(token)) !== held);

        if (inheritedNames.includes(asked)) inherited++;
        expect(resolvesInDocument(schemaDoc(held), ref)).toBe(false);
      }),
      { numRuns: 2000, seed: 20260815 },
    );

    // Without an inherited name the property says nothing about the
    // prototype chain.
    expect(inherited).toBeGreaterThan(0);
  });

  it("accepts the percent-encoded form of a reference it built, and never throws", () => {
    let encodedDiffers = 0;
    let decodeThrew = 0;

    fc.assert(
      fc.property(pointerKey, (key) => {
        const doc = schemaDoc(key);
        const token = componentsSchemaRef(key).slice(COMPONENTS_SCHEMA_REF_PREFIX.length);

        const encoded = `${COMPONENTS_SCHEMA_REF_PREFIX}${encodeURIComponent(token)}`;
        if (encoded !== componentsSchemaRef(key)) encodedDiffers++;
        // A pointer travels in the fragment of a URI, so an author may
        // write it encoded. The reader must find the same schema.
        expect(resolvesInDocument(doc, encoded)).toBe(true);

        const stray = `${COMPONENTS_SCHEMA_REF_PREFIX}${token}%zz`;
        try {
          decodeURIComponent(stray);
        } catch {
          decodeThrew++;
        }
        // A stray `%` is not an encoding. The reader answers, rather than
        // letting the decoder's error escape into the emit.
        expect(resolvesInDocument(doc, stray)).toBe(false);
      }),
      { numRuns: 2000, seed: 20260815 },
    );

    // A run where the encoded form equals the plain one never reaches the
    // fallback.
    expect(encodedDiffers).toBeGreaterThan(0);
    // A run where nothing throws never reaches the guard around the
    // decoder.
    expect(decodeThrew).toBeGreaterThan(0);
  });
});
