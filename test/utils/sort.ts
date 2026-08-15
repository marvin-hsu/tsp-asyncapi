/**
 * Orders two strings by code point, the same order a bare `.sort()` gives.
 *
 * Tests sort a key list to compare it against an expected list without
 * depending on the order the emitter produced. That is not the same as
 * sorting names for a reader, so collation is the wrong tool here.
 * `"B"` and `"__proto__"` sort as `["B", "__proto__"]` by code point, and
 * as `["__proto__", "B"]` by collation, so `localeCompare` would change
 * the very order these tests assert.
 *
 * Passing this function also states the intent that a bare `.sort()` leaves
 * implicit, which is why `sonarjs/no-alphabetical-sort` stays on everywhere.
 * A test that really does need reader-facing alphabetical order still gets
 * flagged, and should use `localeCompare`.
 *
 * @param a - The first string
 * @param b - The second string
 * @returns A negative number, zero, or a positive number, as `sort` expects
 */
export function byCodePoint(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
