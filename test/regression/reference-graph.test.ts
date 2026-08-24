import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

/**
 * Every `$ref` in every committed output resolves.
 *
 * A promotion moves a fragment into `components` and leaves a reference
 * behind. Two of those steps can go wrong in a way no other suite sees. The
 * fragment can be left out of `components` while the reference is written,
 * which gives a document that says nothing where it claims to say something.
 * Or two fragments can claim one key, which points a reference at the wrong
 * fragment.
 *
 * The corpus snapshots and the examples are the whole set of documents this
 * repository commits. Walking their references catches both, in every
 * section at once, without naming any single promotion rule.
 *
 * A recursive schema is not a failure here. A model that names itself writes
 * a reference to its own component, and that component exists, so the walk
 * resolves it and stops. What the walk rejects is a reference that names
 * nothing.
 */

const SNAPSHOTS = new URL("./__snapshots__/", import.meta.url);
const EXAMPLES = new URL("../../examples/", import.meta.url);

/** Every `$ref` string in one document, wherever it sits. */
function referencesIn(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) referencesIn(item, found);
    return found;
  }
  if (node === null || typeof node !== "object") return found;
  // A schema written in another language is copied verbatim, so a `$ref`
  // inside it is the author's text rather than something this emitter wrote.
  // `reportUnresolvedRawSchemaRefs` owns that check, and one corpus case
  // exists to pin a pointer it rejects while the document keeps it as
  // written.
  if ("schemaFormat" in node) return found;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "$ref" && typeof value === "string") {
      found.push(value);
      continue;
    }
    referencesIn(value, found);
  }
  return found;
}

/**
 * Follows one JSON Pointer into `document`.
 *
 * @param document - The parsed document
 * @param pointer - A `$ref` value, such as `#/components/schemas/Order`
 * @returns What the pointer names, or `undefined` when it names nothing
 */
function resolve(document: unknown, pointer: string): unknown {
  // A raw schema is copied verbatim and can hold a reference of its own
  // shape. Only a local pointer is this suite's business.
  if (!pointer.startsWith("#/")) return undefined;
  let node: unknown = document;
  for (const raw of pointer.slice(2).split("/")) {
    const token = decodeURIComponent(raw).replaceAll("~1", "/").replaceAll("~0", "~");
    if (node === null || typeof node !== "object") return undefined;
    if (!Object.hasOwn(node, token)) return undefined;
    node = (node as Record<string, unknown>)[token];
  }
  return node;
}

/** Every committed document, keyed by a name the failure message can use. */
function committedDocuments(): [string, unknown][] {
  const documents: [string, unknown][] = [];
  for (const file of readdirSync(SNAPSHOTS)) {
    const text = readFileSync(new URL(file, SNAPSHOTS), "utf8");
    documents.push([`__snapshots__/${file}`, parseYaml(text)]);
  }
  for (const dir of readdirSync(EXAMPLES, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const path = new URL(`${dir.name}/asyncapi.yaml`, EXAMPLES);
    documents.push([`examples/${dir.name}`, parseYaml(readFileSync(path, "utf8"))]);
  }
  return documents;
}

describe("Output baseline: the reference graph", () => {
  const documents = committedDocuments();

  /** A corpus that found no document would pass every claim below. */
  it("reads every committed document", () => {
    expect(documents.length).toBeGreaterThan(20);
  });

  it.each(documents)("resolves every reference in %s", (name, document) => {
    const dangling = referencesIn(document).filter(
      (pointer) => pointer.startsWith("#/") && resolve(document, pointer) === undefined,
    );

    expect(dangling, `${name} references nothing at these pointers`).toEqual([]);
  });

  /**
   * A `$ref` is only correct if what it names is the right kind of thing. A
   * key claimed by two fragments resolves, so the walk above cannot see it.
   * Every section this emitter fills holds one kind, and a schema written in
   * another language is the one that a wrong claim would swap in.
   */
  it.each(documents)("keeps each components section to one kind in %s", (name, document) => {
    const components = (document as { components?: Record<string, unknown> }).components ?? {};
    const foreign: string[] = [];
    for (const [section, entries] of Object.entries(components)) {
      if (section === "schemas" || typeof entries !== "object" || entries === null) continue;
      for (const [key, entry] of Object.entries(entries as Record<string, unknown>)) {
        if (entry !== null && typeof entry === "object" && "schemaFormat" in entry) {
          foreign.push(`${section}/${key}`);
        }
      }
    }

    expect(foreign, `${name} put a raw schema outside components.schemas`).toEqual([]);
  });
});
