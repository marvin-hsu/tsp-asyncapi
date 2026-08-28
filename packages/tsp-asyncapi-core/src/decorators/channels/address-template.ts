/**
 * The Channel Address Expression parser, and the checks that run on one.
 *
 * `@channel` and the channel builder both parse the address through this
 * module, so a decorator-time check and an emit-time match can never
 * disagree. An AsyncAPI address expression is a bare `{name}`, with none of
 * RFC 6570's operators or modifiers, so this parser stays much smaller than
 * the compiler's own `parseUriTemplate`.
 */

/**
 * The character set a channel address parameter name may use.
 *
 * The AsyncAPI JSON Schema puts no pattern on a Parameters Object key, so
 * this rule is stricter: the key must also be a valid TypeSpec property
 * name, since that property is what declares the parameter. A name outside
 * this set can never be declared.
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
 * The scheme and host are not checked. AsyncAPI states no rule against a
 * full URL, a bare path, or a plain topic name as an address, and its own
 * WebSocket examples put a full URL there. A query string and a fragment
 * are forbidden by the specification. A channel binding expresses them
 * instead. The remaining rules keep the address parseable: braces must
 * pair up without nesting, and a name between them must fit a TypeSpec
 * property name.
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
 * It strips every well-formed expression out first. A brace left in the
 * remainder belongs to no pair, which covers an unclosed `{`, a stray `}`,
 * and a nested pair alike without a character walk. Names then come from
 * the same parser the emitter uses.
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
