/**
 * The byte-for-byte `.avsc` baseline, driven by a corpus on disk.
 *
 * `baseline.test.ts` does this for the AsyncAPI document. The Avro emitter
 * had no counterpart: what pinned its bytes was the committed example, which
 * is one program written to be read rather than a corpus written to be
 * compared. So a change in key order, in indentation, or in which branch
 * leads a union was only caught where the example happened to show it.
 *
 * Adding a case means dropping a `.tsp` into `avro-specs/`. The runner finds
 * it, emits it, and compares every file the emitter wrote against
 * `__avro_snapshots__/<name>/<path the emitter chose>`.
 *
 * These snapshots are the text the emitter wrote, not a re-serialized object,
 * so they pin key order and indentation as well as content. Avro reads a
 * default against the first branch of a union alone, so key order here is
 * behaviour and not only formatting.
 *
 * When a diff appears, do not update the snapshot to make the suite pass.
 * Explain the diff first. An unexplained diff is the refactor breaking the
 * output.
 *
 * A spec must not write its own `import`: the tester puts that above the text
 * it is given, and TypeSpec requires every import to come first.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { acceptSchema, emitAvro } from "../utils/avro.js";
import { byCodePoint } from "../utils/sort.js";

const SPECS = new URL("./avro-specs/", import.meta.url);
const SNAPSHOTS = "./__avro_snapshots__";
const SNAPSHOT_DIR = new URL("./__avro_snapshots__/", import.meta.url);

const names = readdirSync(SPECS)
  .filter((file) => file.endsWith(".tsp"))
  .sort(byCodePoint)
  .map((file) => file.replace(/\.tsp$/, ""));

/**
 * Every file under one directory, as a path relative to it.
 *
 * The emitter writes a file per Avro namespace segment, so the committed
 * baselines sit several directories deep and a flat read would miss them.
 *
 * @param directory - The directory to walk
 * @returns Every file below it, with the directory prefix removed
 */
function filesUnder(directory: URL): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      found.push(
        ...filesUnder(new URL(`${entry.name}/`, directory)).map((path) => `${entry.name}/${path}`),
      );
    } else {
      found.push(entry.name);
    }
  }
  return found;
}

describe("Avro output baseline", () => {
  for (const name of names) {
    const code = readFileSync(new URL(`${name}.tsp`, SPECS), "utf8");

    it(name, async () => {
      const result = await emitAvro(code);
      // A baseline taken from a program that also reported would freeze a
      // half-built schema, and every spec here is written to compile clean.
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([]);

      const written = Object.keys(result.texts).sort(byCodePoint);
      expect(written.length).toBeGreaterThan(0);

      for (const path of written) {
        // The reference implementation reads the schema before its bytes are
        // pinned. A baseline nothing can build would otherwise be committed
        // and then defended by this very suite.
        const text = result.texts[path];
        acceptSchema(JSON.parse(text));
        await expect(text).toMatchFileSnapshot(`${SNAPSHOTS}/${name}/${path}`);
      }
    });
  }

  it("has a spec for every committed baseline", async () => {
    const expected: string[] = [];
    for (const name of names) {
      const result = await emitAvro(readFileSync(new URL(`${name}.tsp`, SPECS), "utf8"));
      expected.push(...Object.keys(result.texts).map((path) => `${name}/${path}`));
    }
    // A baseline with no spec is never compared against anything, so it would
    // sit in the tree looking like a guard while guarding nothing.
    const committed = filesUnder(SNAPSHOT_DIR);
    committed.sort(byCodePoint);
    expected.sort(byCodePoint);
    expect(committed).toEqual(expected);
  });
});
