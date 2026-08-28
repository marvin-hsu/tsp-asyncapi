import { describe, it, expect } from "vitest";
import { localRef } from "#core/decorators/messages/raw-schema.js";

/**
 * Which shapes read back as a reference into this document.
 *
 * A raw schema may point at a component instead of describing one, and only a
 * fragment that opens with `#/` names something inside this document. Anything
 * else — a bare `#`, a URL, a relative path, a non-string, a value that is not
 * an object — is not that.
 *
 * The shapes are enumerated because they are the rule. Restating the rule as
 * a mirrored oracle, with the same conditions in the same order, would only
 * assert that the code matches itself.
 *
 * The claim that does not come from the rule stays a property in
 * `test/property-based/pure-predicates.test.ts`: a sibling key beside the
 * `$ref` must not change the answer, over drawn shapes and drawn keys.
 */
describe("Unit: localRef — the reference form it accepts", () => {
  it.each([
    { kind: "a pointer into components", value: { $ref: "#/components/schemas/Order" } },
    { kind: "the shortest local pointer", value: { $ref: "#/" } },
  ])("reads back $kind", ({ value }) => {
    expect(localRef(value)).toBe(value.$ref);
  });

  it.each([
    // A bare fragment names the whole document, not a schema in it. This is
    // the row a prefix relaxed from `#/` to `#` turns red.
    { kind: "a bare fragment", value: { $ref: "#" } },
    { kind: "a fragment with no slash", value: { $ref: "#components" } },
    { kind: "an anchor", value: { $ref: "#anchor" } },
    { kind: "an absolute URL", value: { $ref: "http://example.com/schema.json" } },
    { kind: "a path into another file", value: { $ref: "./other.json#/components/schemas/Order" } },
    { kind: "a bare path", value: { $ref: "components/schemas/Order" } },
    { kind: "an empty string", value: { $ref: "" } },
    // The type test needs its own rows: a `$ref` that is not a string.
    { kind: "a number", value: { $ref: 5 } },
    { kind: "null", value: { $ref: null } },
    { kind: "a nested object", value: { $ref: { $ref: "#/x" } } },
    { kind: "an array", value: { $ref: ["#/x"] } },
    { kind: "no $ref at all", value: { type: "object" } },
    { kind: "an empty object", value: {} },
    // The object test needs its own rows: a value that is not an object.
    { kind: "the pointer as bare text", value: "#/components/schemas/Order" },
    { kind: "a bare null", value: null },
    { kind: "undefined", value: undefined },
    { kind: "a bare number", value: 7 },
    { kind: "a bare boolean", value: true },
    { kind: "a bare array", value: [{ $ref: "#/x" }] },
  ])("refuses $kind", ({ value }) => {
    expect(localRef(value)).toBeUndefined();
  });
});
