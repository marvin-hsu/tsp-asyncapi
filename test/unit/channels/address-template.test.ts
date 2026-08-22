import { describe, it, expect } from "vitest";
import { checkAddress } from "../../../src/decorators/channels/address-template.js";

/**
 * The enumerable rules of the address check.
 *
 * Two claims of the address grammar have no open dimension against today's
 * implementation. The `?`/`#` rule is an `includes()` call, so the insertion
 * position cannot change the answer, and the realistic rewrites that would
 * make position matter — a `startsWith`, a check that only trims the ends, a
 * character walk that treats an expression body differently — are all killed
 * by the four fixed positions below. The name rule is one `^[...]+$` regex
 * per name, so where the bad character sits inside the name is equally dead;
 * the live dimension is which character it is, and that set is written out.
 *
 * The open dimensions of the same grammar stay properties in
 * `test/property-based/address-template.test.ts`: the parse round trip, the
 * brace interactions, and the check-and-parser agreement over arbitrary text.
 */
describe("Unit: channel address — the query and fragment marks", () => {
  /**
   * The four places a mark can sit relative to an expression. The
   * inside-the-expression row also pins the order of the checks: the mark is
   * reported before the name around it is read.
   */
  const POSITIONS: readonly { where: string; render: (mark: string) => string }[] = [
    { where: "at the start", render: (mark) => `${mark}orders/{region}/events` },
    { where: "inside a literal", render: (mark) => `orders${mark}x/{region}/events` },
    { where: "inside an expression", render: (mark) => `orders/{re${mark}gion}/events` },
    { where: "at the end", render: (mark) => `orders/{region}/events${mark}` },
  ];

  it.each(
    POSITIONS.flatMap(({ where, render }) => [
      { mark: "?", where, address: render("?"), messageId: "query" },
      { mark: "#", where, address: render("#"), messageId: "fragment" },
    ]),
  )("rejects $mark $where", ({ address, messageId }) => {
    expect(checkAddress(address)).toStrictEqual({
      code: "invalid-channel-address",
      messageId,
    });
  });
});

describe("Unit: channel address — the parameter name set", () => {
  /**
   * Characters outside `[A-Za-z0-9_-]`. A brace, a `?`, and a `#` are left
   * out: each of those names an earlier problem, so the check would answer
   * before it reads the name.
   */
  const ILLEGAL_CHARS = [".", "/", " ", ":", "$", "*", "%", "+", "漢", "\t"];

  it.each(ILLEGAL_CHARS)("rejects a name carrying %j, and reports it as written", (bad) => {
    const name = `us${bad}er`;
    expect(checkAddress(`orders/{id}/{${name}}`)).toStrictEqual({
      code: "invalid-channel-param-name",
      name,
    });
  });

  it("rejects the empty name, which `{}` scans as", () => {
    // The parser scans `{}` as an expression with an empty name on purpose,
    // so that only the name check rejects it. A scanner that required one
    // character would leave `{}` outside every expression, and an address
    // with an empty expression would pass every check.
    expect(checkAddress("orders/{}/events")).toStrictEqual({
      code: "invalid-channel-param-name",
      name: "",
    });
  });

  it("reports the first broken name, not the last one seen", () => {
    expect(checkAddress("{a.b}/{id}")).toStrictEqual({
      code: "invalid-channel-param-name",
      name: "a.b",
    });
  });
});
