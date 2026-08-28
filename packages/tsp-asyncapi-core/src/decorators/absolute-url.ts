/**
 * Answers whether a string is an absolute URL, per the AsyncAPI `uri`
 * format ("MUST be in the form of an absolute URL"). A relative reference
 * such as `/token` fails, and so does free text.
 *
 * One function backs every `uri` field: `@securityScheme`'s
 * `openIdConnectUrl` and OAuth flow URLs, `@externalDocs`'s link, and
 * `@info`'s `termsOfService`, `contact.url`, and `license.url`. The checks
 * cannot drift apart. It parses the value rather than matching a
 * pattern, using the same judge the AsyncAPI validator uses. Whitespace is
 * rejected first, since the parser would otherwise escape a space instead
 * of refusing it.
 *
 * @param value - The value the author wrote, already trimmed
 * @returns Whether the value is an absolute URL
 */
export function isAbsoluteUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  return URL.canParse(value);
}
