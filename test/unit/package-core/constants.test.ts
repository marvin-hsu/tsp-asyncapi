import { describe, it, expect } from "vitest";
import { SERVER_NAME_PATTERN, COMPONENTS_KEY_PATTERN } from "#core/constants.js";
import { isSafeComponentsKey } from "#core/naming.js";

/**
 * The relationship between the two name charsets, character by character.
 *
 * A server name must also key the root `servers` map, and a components key
 * has its own charset, so the server charset has to sit inside the other
 * one. Both rules live in `constants.ts`, and `isSafeComponentsKey` in
 * `naming.ts` is the reader of the second one.
 *
 * Both are one `^[...]+$` class, so a single character decides the whole
 * relationship; neither its neighbours nor the name's length matter. The
 * rows below enumerate every character that separates or joins the charsets.
 */
describe("Unit: the two name charsets", () => {
  it.each(["A", "z", "0", "9", "-", "_"])("lets %j into both charsets", (char) => {
    expect(SERVER_NAME_PATTERN.test(char)).toBe(true);
    expect(isSafeComponentsKey(char)).toBe(true);
    expect(COMPONENTS_KEY_PATTERN.test(char)).toBe(true);
  });

  it("lets a dot key a component, and never name a server", () => {
    // The dot is the one character that separates the charsets. The wider
    // one takes it because a components key carries namespace qualification;
    // a server name never does.
    expect(isSafeComponentsKey(".")).toBe(true);
    expect(COMPONENTS_KEY_PATTERN.test(".")).toBe(true);
    expect(SERVER_NAME_PATTERN.test(".")).toBe(false);
  });
});
