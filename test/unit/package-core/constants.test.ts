import { describe, it, expect } from "vitest";
import { SERVER_NAME_PATTERN, SECURITY_SCHEME_NAME_PATTERN } from "#core/constants.js";
import { isSafeComponentsKey } from "#core/naming.js";

/**
 * The relationship between the three name charsets, character by character.
 *
 * A server name must also key the root `servers` map, and a security scheme
 * name must key the Components Object, so the server charset has to sit
 * inside the other two. The three rules live in two modules —
 * `SERVER_NAME_PATTERN` and `SECURITY_SCHEME_NAME_PATTERN` in `constants.ts`,
 * `isSafeComponentsKey` in `naming.ts` — which is exactly how they drift.
 *
 * All three are one `^[...]+$` class, so single characters decide the whole
 * relationship: no character interacts with its neighbours, and length adds
 * nothing. A property once drew names of one to twelve characters to state
 * this; the characters that separate or join the charsets are the six rows
 * below, written out.
 */
describe("Unit: the three name charsets", () => {
  it.each(["A", "z", "0", "9", "-", "_"])("lets %j into all three charsets", (char) => {
    expect(SERVER_NAME_PATTERN.test(char)).toBe(true);
    expect(isSafeComponentsKey(char)).toBe(true);
    expect(SECURITY_SCHEME_NAME_PATTERN.test(char)).toBe(true);
  });

  it("lets a dot key a component, and never name a server", () => {
    // The dot is the one character that separates the charsets. The wider
    // pair takes it because a components key carries namespace qualification;
    // a server name never does.
    expect(isSafeComponentsKey(".")).toBe(true);
    expect(SECURITY_SCHEME_NAME_PATTERN.test(".")).toBe(true);
    expect(SERVER_NAME_PATTERN.test(".")).toBe(false);
  });
});
