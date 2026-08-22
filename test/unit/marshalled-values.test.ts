import { describe, it, expect } from "vitest";
import { isPlainObject } from "../../src/marshalled-values.js";

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
