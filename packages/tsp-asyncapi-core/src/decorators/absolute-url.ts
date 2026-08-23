/**
 * Answers whether a string is an absolute URL.
 *
 * Several AsyncAPI fields carry the `uri` format. The specification words
 * the rule as "MUST be in the form of an absolute URL". The official parser
 * checks that format and rejects the whole document when a value fails it.
 * A relative reference such as `/token` fails. So does free text such as
 * `not a url`.
 *
 * The check is one function because several decorators need the same
 * answer. `@securityScheme` writes `openIdConnectUrl` and the OAuth flow
 * URLs. `@externalDocs` writes the link of an External Documentation
 * Object. A separate check per field would let the two drift apart.
 *
 * The value is parsed rather than matched against a pattern. A URL parser
 * is the same judge the validator uses, so the two agree. Whitespace is
 * rejected first, because the parser escapes a space instead of refusing
 * it, and the format check of the validator refuses it.
 *
 * @param value - The value the author wrote, already trimmed
 * @returns Whether the value is an absolute URL
 */
export function isAbsoluteUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  return URL.canParse(value);
}
