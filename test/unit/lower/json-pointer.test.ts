import { describe, it, expect } from "vitest";
import { resolvesInDocument } from "../../../src/lower/json-pointer.js";
import { COMPONENTS_SCHEMA_REF_PREFIX } from "../../../src/constants.js";

/**
 * The array-index spellings the reference reader must refuse.
 *
 * RFC 6901 spells an array index as `0` or a digit run with no leading zero.
 * The reader used to pass the token to `Number`, which accepts much more:
 * every token below resolved against a three-member array — `""` and `" "`
 * both became 0, and `"01"`, `"1.0"`, `"+1"`, `"0x1"` and `"1e0"` all became
 * 1. So a raw schema carrying `#/…/oneOf/0x1` was reported as resolving,
 * while a reader that follows the specification finds nothing there.
 *
 * The tokens are the whole point, so they are enumerated. The open-ended
 * side of the same rule — drawn indexes against drawn array lengths — is the
 * bounds property in `test/property-based/json-pointer.test.ts`, and the
 * whole-document consequence is the corpus case `raw-ref-array-index`.
 */
describe("Unit: the array-index rule of the reference reader", () => {
  /** Wraps an array where a raw schema would carry one. */
  function arrayDoc(items: unknown[]): unknown {
    return { components: { schemas: { Payload: { oneOf: items } } } };
  }

  const arrayRef = (token: string): string =>
    `${COMPONENTS_SCHEMA_REF_PREFIX}Payload/oneOf/${token}`;

  it.each(["", " ", "01", "1.0", "+1", "0x1", "1e0"])(
    "rejects the array index %j, which the specification does not spell",
    (token) => {
      expect(resolvesInDocument(arrayDoc(["a", "b", "c"]), arrayRef(token))).toBe(false);
    },
  );
});
