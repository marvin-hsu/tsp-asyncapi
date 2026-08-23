import { describe, it, expect } from "vitest";
import { missingFields } from "#core/decorators/bindings/fields.js";

/**
 * Which written values count as saying nothing.
 *
 * A binding decorator asks this before it reports a missing required field.
 * The rule is deliberately narrower than falsiness: `false` and `0` are
 * answers an author gave, and a binding that dropped them would report a
 * field the author had filled in.
 *
 * The value kinds are enumerated because they are the rule. A property once
 * stated the same claim by rebuilding the rule as its own oracle — a filter
 * with the same three conditions in the same order as the implementation —
 * which asserts that the code does what the code does. It cannot say what
 * the rule should be, and a change to the rule has to be made twice with
 * nothing to enforce the pairing.
 *
 * The claims that do not come from the rule — the answer is a subset of
 * `required`, in that order, without repeats — stay a property in
 * `test/property-based/pure-predicates.test.ts`, where the field sets and
 * their orders are drawn.
 */
describe("Unit: missingFields — which values say nothing", () => {
  it.each([
    { kind: "undefined", written: undefined, missing: true },
    { kind: "null", written: null, missing: true },
    { kind: "the empty string", written: "", missing: true },
    { kind: "a single space", written: " ", missing: true },
    { kind: "a tab", written: "\t", missing: true },
    { kind: "a newline and spaces", written: "\n  ", missing: true },
    { kind: "text", written: "queue-1", missing: false },
    { kind: "text that needs trimming", written: "  queue-1  ", missing: false },
    // The four an implementation using falsiness would get wrong.
    { kind: "false", written: false, missing: false },
    { kind: "zero", written: 0, missing: false },
    { kind: "the string zero", written: "0", missing: false },
    { kind: "the string false", written: "false", missing: false },
    // Neither is a value a marshalled argument can carry, so these rows pin
    // today's answer rather than a rule anyone relies on.
    { kind: "an empty object", written: {}, missing: false },
    { kind: "an empty array", written: [], missing: false },
  ])("treats $kind as $missing", ({ written, missing }) => {
    const answer = missingFields({ topic: written }, ["topic"]);
    expect(answer).toStrictEqual(missing ? ["topic"] : []);
  });

  it("reports a required field the object never mentions", () => {
    // Absent and present-but-undefined reach the same branch, and only this
    // case proves a name can be reported without a key to read.
    expect(missingFields({}, ["topic"])).toStrictEqual(["topic"]);
  });
});
