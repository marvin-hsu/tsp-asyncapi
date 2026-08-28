/**
 * Orders two strings by code point, the same order a bare `.sort()` gives.
 *
 * Tests sort a key list to compare it against an expected list, without
 * depending on the emitter's own order. Collation is the wrong tool for
 * that. `"B"` and `"__proto__"` sort as `["B", "__proto__"]` by code point.
 * Collation orders them as `["__proto__", "B"]` instead, changing the order
 * a test asserts.
 *
 * This also states the intent a bare `.sort()` leaves implicit, which is
 * why `sonarjs/no-alphabetical-sort` stays enabled everywhere. A test that
 * needs reader-facing alphabetical order should use `localeCompare` instead.
 */
export function byCodePoint(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
