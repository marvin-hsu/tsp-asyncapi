import { describe, it, expect } from "vitest";
import { isRuntimeExpression } from "#core/decorators/runtime-expression.js";

/**
 * The four line terminators a pointer token may hold.
 *
 * RFC 6901 puts no limit on a reference token, and both JSON and YAML carry
 * these characters inside a member name. A naive pattern spelled as
 * `(?:\/.*)?$` would refuse them, since `.` matches no line terminator
 * without the `s` flag.
 *
 * JavaScript defines exactly these four as line terminators, so the set is
 * closed and written out here for both halves of the message. The open-ended
 * bodies around the same rule — terminators mixed into drawn tokens, with a
 * counter proving they were drawn — are the grammar property in
 * `test/property-based/format-validators.test.ts`, and the corpus case
 * `pointer-token-newline` pins the emitted document.
 */
describe("Unit: runtime expression — the line terminators", () => {
  it.each([
    { name: "\\n", terminator: "\n" },
    { name: "\\r", terminator: "\r" },
    { name: "U+2028", terminator: " " },
    { name: "U+2029", terminator: " " },
  ])("accepts a pointer token holding $name", ({ terminator }) => {
    expect(isRuntimeExpression(`$message.header#/a${terminator}b`)).toBe(true);
    expect(isRuntimeExpression(`$message.payload#/a${terminator}b`)).toBe(true);
  });
});
