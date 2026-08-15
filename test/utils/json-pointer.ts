/**
 * Resolves a local JSON Pointer against an emitted document.
 *
 * The pointer arrives as the whole `$ref` string, for example
 * `#/components/schemas/Order`. The leading `#/` is dropped, and each step
 * has its RFC 6901 escapes undone. `~1` becomes `/` and `~0` becomes `~`.
 * A `components.schemas` key may hold either character, so a reader that
 * skips the unescaping resolves the wrong node.
 *
 * @param doc - The emitted document, as parsed JSON or YAML
 * @param ref - A `$ref` string that points inside `doc`
 * @returns The node the pointer names, or `undefined` when it names nothing
 */
export function resolveRef(doc: unknown, ref: string): unknown {
  const steps = ref
    .slice(2)
    .split("/")
    .map((step) => step.replaceAll("~1", "/").replaceAll("~0", "~"));
  let node: unknown = doc;
  for (const step of steps) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[step];
  }
  return node;
}
