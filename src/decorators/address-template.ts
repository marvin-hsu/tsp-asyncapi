/**
 * The Channel Address Expression parser, and the checks that run on one.
 *
 * Two consumers share this module. `@channel` checks the address while the
 * decorator runs, so a bad address is reported at the place it was written.
 * The channel builder parses the same address again at emit time, so it can
 * match each expression against the operation parameters that declare it.
 * Both use one parser, so the two can never disagree about what the address
 * says.
 *
 * An AsyncAPI address expression is a bare `{name}`. It has none of RFC
 * 6570's operators or modifiers, which is why this parser is much smaller
 * than the compiler's own `parseUriTemplate`.
 */

/**
 * The character set a channel address parameter name may use.
 *
 * The AsyncAPI JSON Schema puts no pattern on a key of the Parameters
 * Object, so this rule is stricter than the specification. It has to be:
 * the key must also be the name of the TypeSpec property that declares the
 * parameter, and a name outside this set can never be declared. So a name
 * outside it names a parameter that no operation could ever supply.
 */
const PARAM_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

/** One reason an address cannot be used. */
export type AddressProblem =
  | { code: "empty-channel-address" }
  | { code: "invalid-channel-address"; messageId: "query" | "fragment" | "unbalanced" }
  | { code: "invalid-channel-param-name"; name: string };

/**
 * Lists the `{name}` expressions of an address, in the order they appear.
 *
 * The caller checks the address first. This function assumes a balanced
 * address, so it reports nothing. Text that is not part of a balanced
 * `{...}` pair is left alone.
 *
 * @param address - The address to parse
 * @returns The parameter names, with a repeated name kept as it is written
 */
export function parseAddressParameters(address: string): string[] {
  const parameters: string[] = [];
  // The name group accepts an empty run, so `{}` is scanned as a parameter
  // with an empty name. The name check then rejects it. A group that
  // required one character would leave `{}` outside every expression, and an
  // address with an empty expression would pass every check.
  const scanner = /\{([^{}]*)\}/g;
  let match = scanner.exec(address);
  while (match !== null) {
    const name = match.at(1);
    if (name !== undefined) parameters.push(name);
    match = scanner.exec(address);
  }
  return parameters;
}

/**
 * Checks one address, and names the first problem it finds.
 *
 * The scheme and the host are not checked. A full URL, a bare path, and a
 * plain topic name are all legal addresses. AsyncAPI states no rule about
 * them, and its own WebSocket examples put a full URL in the address. So a
 * host that repeats a `@server` host is left to the author to judge.
 *
 * Two rules do come from the specification. A query string and a fragment
 * are both forbidden, and a channel binding expresses them instead.
 *
 * The remaining rules keep the address parseable. Braces must pair up and
 * must not nest, and a name between them must be one a TypeSpec property
 * could carry.
 *
 * @param address - The address as it was written, already trimmed
 * @returns The first problem, or `undefined` when the address is usable
 */
export function checkAddress(address: string): AddressProblem | undefined {
  if (address === "") {
    return { code: "empty-channel-address" };
  }
  if (address.includes("?")) {
    return { code: "invalid-channel-address", messageId: "query" };
  }
  if (address.includes("#")) {
    return { code: "invalid-channel-address", messageId: "fragment" };
  }
  return checkAddressBraces(address);
}

/**
 * Checks the braces of an address, and names the first problem among them.
 *
 * The check takes every well-formed expression out of the address first. An
 * expression holds no brace of its own, so a brace left in the remainder
 * belongs to no pair. That covers an unclosed `{`, a stray `}`, and a nested
 * pair alike, and it needs no character walk of its own.
 *
 * The names come from the parser, so the check and the emitter read one
 * address the same way.
 */
function checkAddressBraces(address: string): AddressProblem | undefined {
  const remainder = address.replaceAll(/\{[^{}]*\}/g, "");
  if (remainder.includes("{") || remainder.includes("}")) {
    return { code: "invalid-channel-address", messageId: "unbalanced" };
  }
  for (const name of parseAddressParameters(address)) {
    if (!PARAM_NAME_PATTERN.test(name)) {
      return { code: "invalid-channel-param-name", name };
    }
  }
  return undefined;
}
