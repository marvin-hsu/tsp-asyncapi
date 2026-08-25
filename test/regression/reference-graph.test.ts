import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { referencesIn } from "../utils/references.js";

/**
 * Every `$ref` in every committed output resolves.
 *
 * A promotion moves a fragment into `components` and leaves a reference
 * behind. The fragment can be left out of `components` while the reference is
 * written, which gives a document that says nothing where it claims to say
 * something. No other suite sees that across committed output.
 *
 * The corpus snapshots and the examples are the whole set of documents this
 * repository commits. Walking their references catches it, in every section
 * at once, without naming any single promotion rule.
 *
 * A schema written in another language is skipped, which the shared walk
 * owns. One corpus case pins a pointer inside such a schema: the emitter
 * rejects it and the document still keeps it as the author wrote it.
 *
 * A recursive schema is not a failure here. A model that names itself writes
 * a reference to its own component, and that component exists, so the walk
 * resolves it and stops. What the walk rejects is a reference that names
 * nothing.
 */

const SNAPSHOTS = new URL("./__snapshots__/", import.meta.url);
const EXAMPLES = new URL("../../examples/", import.meta.url);

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

/** The emitter whose output this suite walks. */
const EMITTER = "tsp-asyncapi";

/**
 * The example directories that ask for an AsyncAPI document.
 *
 * An example names its emitters in its own `tspconfig.yaml`, and not every
 * emitter here writes a document: the Avro example writes `.avsc` files, which
 * carry no `$ref`. So the reason a directory is passed over is read from that
 * file, never from the absence of the output. A directory that asks for a
 * document and has none is a document that went missing, and the read below
 * fails on it.
 */
function exampleDirectories(): string[] {
  const directories: string[] = [];
  for (const dir of readdirSync(EXAMPLES, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const text = readFileSync(new URL(`${dir.name}/tspconfig.yaml`, EXAMPLES), "utf8");
    const config: unknown = parseYaml(text);
    const emit = (config as { emit?: unknown }).emit;
    if (!Array.isArray(emit) || !emit.includes(EMITTER)) continue;
    directories.push(dir.name);
  }
  return directories;
}

/** Every committed document, keyed by a name the failure message can use. */
function committedDocuments(): [string, unknown][] {
  const documents: [string, unknown][] = [];
  for (const file of readdirSync(SNAPSHOTS)) {
    const text = readFileSync(new URL(file, SNAPSHOTS), "utf8");
    documents.push([`__snapshots__/${file}`, parseYaml(text)]);
  }
  for (const name of exampleDirectories()) {
    const text = readFileSync(new URL(`${name}/asyncapi.yaml`, EXAMPLES), "utf8");
    documents.push([`examples/${name}`, parseYaml(text)]);
  }
  return documents;
}

describe("Output baseline: the reference graph", () => {
  const documents = committedDocuments();

  /**
   * A corpus that found no document would pass every claim below.
   *
   * This floor catches an empty corpus and nothing finer. What catches a
   * single document that went missing is the read in `committedDocuments`: an
   * example that asks for this emitter and has no document fails there, on the
   * open, naming the file.
   */
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
