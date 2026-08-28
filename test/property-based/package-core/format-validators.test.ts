import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { isAbsoluteUrl } from "#core/decorators/absolute-url.js";
import { isRuntimeExpression } from "#core/decorators/runtime-expression.js";

/**
 * Properties of the three format checks a decorator runs on author text.
 *
 * Each check decides an acceptance surface. A defect moves that surface: the
 * check takes a value the official parser refuses, or it refuses a value the
 * specification allows. Both defects hide at the edge of the grammar — an
 * empty pointer, a scheme nobody wrote an example for, a missing anchor.
 *
 * The example tests pin single strings. These properties build a value from
 * the grammar instead, then break one part of a built value and require the
 * answer to flip.
 */

describe("Unit: absolute URL — whitespace", () => {
  /** The whitespace characters a URL parser handles in several ways. */
  const whitespace = fc.constantFrom(
    " ",
    "\t",
    "\n",
    "\r",
    "\f",
    "\v",
    "\u00a0",
    "\u2028",
    "\ufeff",
  );

  it("rejects a legal URL that carries a whitespace character", () => {
    let parserAccepts = 0;

    fc.assert(
      fc.property(fc.webUrl(), whitespace, fc.nat(), (url, space, offset) => {
        const at = offset % (url.length + 1);
        const spaced = `${url.slice(0, at)}${space}${url.slice(at)}`;
        // The parser strips or escapes the character instead of refusing it.
        // Those are the cases the guard in front of the parser carries.
        if (URL.canParse(spaced)) parserAccepts++;
        expect(isAbsoluteUrl(spaced)).toBe(false);
      }),
      { numRuns: 2000, seed: 20260815 },
    );

    // A run where the parser refused every spaced value would pass without
    // the guard, so it would say nothing about the guard.
    expect(parserAccepts).toBeGreaterThan(0);
  });
});

describe("Unit: absolute URL — scheme", () => {
  /**
   * The schemes the WHATWG standard calls special.
   *
   * A special scheme takes a host, so the value is built in authority form.
   */
  const specialScheme = fc.constantFrom("http", "https", "ws", "wss", "ftp");

  /** A scheme with no special handling. Its body is an opaque path. */
  const opaqueScheme = fc.constantFrom("urn", "mailto", "tag", "x-custom.scheme+v1", "coap");

  const host = fc.stringMatching(/^[a-z][a-z0-9-]{0,8}(\.[a-z]{2,4})?$/);
  const path = fc.stringMatching(/^(\/[a-z0-9._-]{0,6}){0,3}$/);
  const opaqueBody = fc.stringMatching(/^[a-z0-9][a-z0-9:._-]{0,14}$/);

  const absoluteUrl = fc.oneof(
    fc.tuple(specialScheme, host, path).map(([scheme, h, p]) => `${scheme}://${h}${p}`),
    fc.tuple(opaqueScheme, opaqueBody).map(([scheme, body]) => `${scheme}:${body}`),
  );

  /** Text with no colon, so it names no scheme and cannot be absolute. */
  const notAbsolute = fc.oneof(
    fc.string().filter((text) => !text.includes(":") && !/\s/.test(text)),
    fc.stringMatching(/^(\/[a-z]{1,5}){1,3}$/),
    fc.constantFrom("token", "example.com", "//example.com", "./relative", "?query", "#frag"),
  );

  /**
   * `isAbsoluteUrl` is `URL.canParse` behind a whitespace guard, so a
   * differential test against that same parser states the implementation
   * twice. This property builds both sides from the grammar instead. A value
   * with a scheme and an authority, or a scheme and an opaque body, is
   * absolute. Text holding no colon names no scheme, so it is not.
   */
  it("accepts a built URL of any scheme and refuses text naming no scheme", () => {
    let accepted = 0;
    let rejected = 0;

    fc.assert(
      fc.property(absoluteUrl, notAbsolute, (url, text) => {
        accepted++;
        expect(isAbsoluteUrl(url)).toBe(true);
        rejected++;
        expect(isAbsoluteUrl(text)).toBe(false);
      }),
      { numRuns: 2000, seed: 20260815 },
    );

    // Each side of the acceptance surface needs cases of its own.
    expect(accepted).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
  });
});

const source = fc.constantFrom("header", "payload");

/**
 * The body of the JSON Pointer half.
 *
 * The pool holds the characters RFC 6901 escaping and JSON Pointer syntax
 * both care about; plain letters would never reach the edge of the pattern.
 * The empty string is the pointer that names the whole object. The line
 * terminators are in the pool because the pattern once refused them, and
 * leaving them out would guard that fix only by hand-written cases.
 */
const pointerBody = fc.oneof(
  fc.constant(""),
  fc
    .array(
      fc.oneof(
        fc.constantFrom("~", "/", "~0", "~1", "%", ".", "-", "_", " "),
        fc.constantFrom("\n", "\r", "\u2028", "\u2029"),
        fc.stringMatching(/^[A-Za-z0-9]{1,3}$/),
      ),
      { minLength: 1, maxLength: 5 },
    )
    .map((pieces) => pieces.join("")),
);

const LINE_TERMINATORS = /[\n\r\u2028\u2029]/;

describe("Unit: runtime expression — the grammar accepts what it builds", () => {
  it("accepts every expression built from the grammar", () => {
    let emptyPointer = 0;
    let carriesTilde = 0;
    let carriesTerminator = 0;

    fc.assert(
      fc.property(source, pointerBody, (which, body) => {
        const pointer = body === "" ? "" : `/${body}`;
        const expression = `$message.${which}#${pointer}`;
        if (body === "") emptyPointer++;
        if (body.includes("~")) carriesTilde++;
        if (LINE_TERMINATORS.test(body)) carriesTerminator++;
        expect(isRuntimeExpression(expression)).toBe(true);
      }),
      { numRuns: 2000, seed: 20260815 },
    );

    // The empty pointer is its own branch of the pattern.
    expect(emptyPointer).toBeGreaterThan(0);
    // A body with no `~` never reaches the escaping of RFC 6901.
    expect(carriesTilde).toBeGreaterThan(0);
    // The terminators are what the pattern once refused, so a run that drew
    // none would say nothing about that.
    expect(carriesTerminator).toBeGreaterThan(0);
  });
});

describe("Unit: runtime expression — one break refuses the whole value", () => {
  /**
   * The five ways an author writes a runtime expression wrong. The kinds are
   * a closed list, so each gets its own case rather than a draw — a sampled
   * version needed a per-kind counter to promise every kind had been applied.
   * The body inside each case stays drawn: the break must refuse the value
   * whatever legal pointer it carries.
   */
  const BREAKAGES: readonly { kind: string; break: (which: string, pointer: string) => string }[] =
    [
      { kind: "no fragment marker", break: (which, pointer) => `$message.${which}${pointer}` },
      {
        kind: "wrong case in the source",
        break: (which, pointer) => `$message.${which.toUpperCase()}#${pointer}`,
      },
      { kind: "wrong prefix", break: (which, pointer) => `$msg.${which}#${pointer}` },
      {
        kind: "leading whitespace",
        // Only the leading side breaks the value. A trailing space is a legal
        // reference token character, so it stays accepted.
        break: (which, pointer) => ` $message.${which}#${pointer}`,
      },
    ];

  it.each(BREAKAGES)("refuses an expression with $kind", ({ break: damage }) => {
    fc.assert(
      fc.property(source, pointerBody, (which, body) => {
        const pointer = body === "" ? "" : `/${body}`;
        expect(isRuntimeExpression(damage(which, pointer))).toBe(false);
      }),
      { numRuns: 400, seed: 20260815 },
    );
  });

  it("refuses a pointer that opens without a slash", () => {
    fc.assert(
      fc.property(
        source,
        // Dropping the slash breaks the value only when a body follows it and
        // the body opens with no slash of its own, so the draw is filtered
        // rather than the case skipped at run time.
        pointerBody.filter((body) => body !== "" && !body.startsWith("/")),
        (which, body) => {
          expect(isRuntimeExpression(`$message.${which}#${body}`)).toBe(false);
        },
      ),
      { numRuns: 400, seed: 20260815 },
    );
  });
});
