import { describe, expect, it } from "vitest";
import { $lib } from "#core/lib.js";

/**
 * The message variants of `protobuf-artifact-unavailable`.
 *
 * This emitter renders proto3 text itself. It reads the decorator state of
 * `@typespec/protobuf` and never runs that library's emitter, so a message
 * that sends the author to that emitter names a tool which produced nothing.
 * Each variant here also has a place in the flow that reports it.
 */
describe("Unit: the diagnostic catalogue", () => {
  const variants = $lib.diagnostics["protobuf-artifact-unavailable"].messages;

  it("gives protobuf-artifact-unavailable one variant per refusal", () => {
    expect([...Object.keys(variants)].sort((a, b) => a.localeCompare(b))).toEqual([
      "default",
      "no-package",
      "not-converted",
      "unknown-scalar",
    ]);
  });

  it("sends no author to the official Protobuf emitter", () => {
    const rendered = Object.values(variants).map((message) =>
      typeof message === "string"
        ? message
        : message({ name: "Order", package: "com.example", construct: "a union", scalar: "Money" }),
    );

    for (const text of rendered) expect(text).not.toMatch(/official Protobuf emitter/i);
  });
});
