/**
 * The AsyncAPI runtime expression two decorators share.
 *
 * `@correlationId` uses one to say where the correlation value sits inside a
 * message. `@parameterLocation` uses one to say where a channel parameter
 * value sits inside a message. AsyncAPI gives the two fields the same
 * grammar, so they share one check here rather than keep two copies that
 * could drift.
 */

/**
 * The legal shape of a runtime expression that locates a value in a message.
 *
 * The expression is a source followed by a fragment. The source is
 * `$message.header` or `$message.payload`. The fragment is a `#` followed by
 * a JSON Pointer (RFC 6901). A JSON Pointer is either empty or a run of
 * `/`-prefixed tokens, so anything after the `#` must be empty or start with
 * `/`.
 *
 * The `#` is required. The prose ABNF of the specification reads as if the
 * fragment were optional, but the normative JSON Schema of the specification
 * requires the `#`. The official parser follows the JSON Schema and rejects a
 * document that carries the bare `$message.header`. So this emitter rejects
 * it too, rather than emit a document no tool accepts.
 *
 * An empty pointer, `$message.header#`, points at the whole headers object
 * and is legal. A pointer with several levels, such as
 * `$message.payload#/user/id`, is legal too.
 *
 * The pointer is matched with `[\s\S]` rather than `.`. RFC 6901 puts no
 * character outside a reference token, so a token holding a line terminator
 * is legal, and `.` matches no line terminator without the `s` flag.
 *
 * The end is spelled `(?![\s\S])` rather than `$`. The two are equivalent
 * here, because the pattern carries no `m` flag. The negative lookahead
 * states end-of-input without depending on that.
 */
const RUNTIME_EXPRESSION_PATTERN = /^\$message\.(?:header|payload)#(?:\/[\s\S]*)?(?![\s\S])/;

/**
 * Tells whether one string is a legal runtime expression.
 *
 * The format is the only thing checked. Neither decorator checks that the
 * pointer names a field the headers or the payload schema declares. AsyncAPI
 * states no such requirement, and its own examples point at paths their
 * schemas never define. A check would reject documents the specification
 * allows.
 *
 * @param expression - The text the author wrote
 * @returns True when the expression is one an AsyncAPI tool can follow
 */
export function isRuntimeExpression(expression: string): boolean {
  return RUNTIME_EXPRESSION_PATTERN.test(expression);
}
