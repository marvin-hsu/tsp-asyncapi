import { describe, it, expect } from "vitest";
import type { Program } from "@typespec/compiler";
import { isPlainObject, toPlainValue } from "#core/marshalled-values.js";

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

describe("Unit: toPlainValue — marshalled arguments as plain JSON", () => {
  /**
   * A `Program` reaches `serializeValueAsJson`, and that call happens only
   * for a TypeSpec `Value`. Every case below passes plain JavaScript, so the
   * program is never read. An empty object stands in for it, which keeps
   * these cases free of a compilation.
   */
  const program = {} as Program;

  it.each([
    { name: "a string", value: "text", plain: "text" },
    { name: "a number", value: 7, plain: 7 },
    { name: "a boolean", value: false, plain: false },
    { name: "null", value: null, plain: null },
  ])("passes $name through", ({ value, plain }) => {
    expect(toPlainValue(program, value)).toStrictEqual(plain);
  });

  it("converts a nested array", () => {
    expect(toPlainValue(program, [1, "two", [3, false]])).toStrictEqual([1, "two", [3, false]]);
  });

  it("converts an empty array", () => {
    expect(toPlainValue(program, [])).toStrictEqual([]);
  });

  it("converts a nested object", () => {
    expect(toPlainValue(program, { a: 1, b: { c: "d" } })).toStrictEqual({ a: 1, b: { c: "d" } });
  });

  /**
   * A field holding `undefined` is dropped rather than emitted as `null`.
   * The two mean different things in a document, and an absent field is what
   * the author wrote.
   */
  it("drops an object field that holds undefined", () => {
    expect(toPlainValue(program, { a: 1, b: undefined })).toStrictEqual({ a: 1 });
  });

  /**
   * `undefined` at the top is unrepresentable rather than absent, so the
   * caller gets `undefined` and omits the field.
   */
  it("returns undefined for undefined", () => {
    expect(toPlainValue(program, undefined)).toBeUndefined();
  });

  /**
   * An unrepresentable element propagates out of the whole array. A list with
   * a hole in it is not the list the author wrote, so nothing is emitted.
   */
  it("returns undefined when an array element is unrepresentable", () => {
    expect(toPlainValue(program, [1, undefined, 3])).toBeUndefined();
  });

  /** The same rule, one level down, and through a nested array. */
  it("returns undefined when a nested array element is unrepresentable", () => {
    expect(toPlainValue(program, [1, [2, undefined]])).toBeUndefined();
  });

  /**
   * An object field is dropped when it holds `undefined`, so the value that
   * propagates has to come from deeper. A nested array carries it up.
   */
  it("returns undefined when an object field holds an unrepresentable array", () => {
    expect(toPlainValue(program, { a: [undefined] })).toBeUndefined();
  });

  /**
   * A symbol is neither a primitive the document can carry nor an object, so
   * it takes the default arm and is representable as itself. Nothing in the
   * emitter produces one. The case pins the arm rather than a behavior the
   * emitter relies on.
   */
  it("passes a value of an other type through", () => {
    const symbol = Symbol("marker");
    expect(toPlainValue(program, symbol)).toBe(symbol);
  });
});
