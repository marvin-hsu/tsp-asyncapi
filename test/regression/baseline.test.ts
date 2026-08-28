import { describe, it, expect } from "vitest";
import { expectDiagnosticEmpty } from "@typespec/compiler/testing";
import { readdirSync, readFileSync } from "node:fs";
import { AsyncAPITester } from "#emitter/testing.js";
import { LIBRARY_NAME } from "#core/lib.js";
import { PACKAGE_NAME } from "#emitter/lib.js";
import { byCodePoint } from "../utils/sort.js";
import { $lib } from "#core/lib.js";
import type { DiagnosticCode } from "../utils/diagnostics.js";

/**
 * The byte-for-byte output baseline, driven by a corpus on disk.
 *
 * Adding a case means dropping a `.tsp` into `specs/`. The runner finds it,
 * emits it, and compares the result against `__snapshots__/<name>.<ext>`.
 *
 * These snapshots are the file the emitter wrote, not a re-serialized object.
 * So they also pin key order, indentation, and quoting. The serialize stage
 * decides those, and a stage that only reorders keys is still a change a
 * reviewer must see.
 *
 * When a diff appears, do not update the snapshot to make the suite pass.
 * Explain the diff first. An unexplained diff is the refactor breaking the
 * output.
 *
 * Each program stays focused on a few document sections. A single large
 * program would put every diff in one file, and a reviewer could not tell
 * which section moved. Every `.tsp` says at the top which sections it is for
 * and why it exists, because a corpus of unexplained programs cannot be
 * maintained.
 *
 * A spec must not write its own `import` or `using`: the tester puts those
 * above the text it is given, and TypeSpec requires every import to come
 * first. So a `.tsp` here does not stand on its own in an editor, and that is
 * the one cost of holding the source on disk.
 */

const SPECS = new URL("./specs/", import.meta.url);
const SNAPSHOTS = "./__snapshots__";

/** One way to emit one spec: the emitter options, and the file they produce. */
interface Variant {
  options: Record<string, unknown>;
  fileType: string;
  /** The codes the case must report, without the library prefix. */
  diagnostics: DiagnosticCode[];
}

/**
 * The variants of one spec.
 *
 * A spec with no sidecar is emitted once with no options, which is the case
 * for all but one of them. The sidecar exists for a program that has to be
 * emitted more than one way — `info` is emitted as both YAML and JSON — and
 * for one that needs options at all.
 *
 * @returns Every variant of `name` to emit, in the order the sidecar lists them
 */
function variantsOf(name: string): Variant[] {
  let raw: unknown[];
  try {
    raw = JSON.parse(readFileSync(new URL(`${name}.options.json`, SPECS), "utf8")) as unknown[];
  } catch {
    raw = [{}];
  }
  const seen = new Set<string>();
  return raw.map((entry) => {
    const { diagnostics = [], ...options } = entry as Record<string, unknown> & {
      diagnostics?: string[];
    };
    const fileType = options["file-type"] === "json" ? "json" : "yaml";
    // A code that does not exist would make the case assert nothing, and the
    // sidecar is JSON so the compiler cannot catch the typo.
    for (const code of diagnostics) {
      if (!(code in $lib.diagnostics)) {
        throw new Error(`${name}.options.json names ${code}, which is not a diagnostic.`);
      }
    }
    // Two variants writing one snapshot would leave one of them unchecked,
    // and the failure would look like a stale baseline rather than a broken
    // sidecar.
    if (seen.has(fileType)) {
      throw new Error(`${name} has two variants that both write ${name}.${fileType}.`);
    }
    seen.add(fileType);
    return { options, fileType, diagnostics: diagnostics as DiagnosticCode[] };
  });
}

const names = readdirSync(SPECS)
  .filter((file) => file.endsWith(".tsp"))
  .sort(byCodePoint)
  .map((file) => file.replace(/\.tsp$/, ""));

describe("Output baseline", () => {
  for (const name of names) {
    const code = readFileSync(new URL(`${name}.tsp`, SPECS), "utf8");
    for (const { options, fileType, diagnostics: expected } of variantsOf(name)) {
      it(`${name}.${fileType}`, async () => {
        const [result, diagnostics] = await AsyncAPITester.emit(
          PACKAGE_NAME,
          options,
        ).compileAndDiagnose(code);
        // A baseline taken from a program that also reported a diagnostic
        // would freeze a half-built document, so a case that reports has to
        // say which codes it means. Most report nothing.
        //
        // A case is here because it once produced the wrong document. Some of
        // those also report, and the document they still produce is the half
        // worth pinning: the emitter is meant to keep what it can and tell the
        // author about the rest.
        if (expected.length === 0) {
          expectDiagnosticEmpty(diagnostics);
        } else {
          const reported = diagnostics.map((d) => d.code).sort(byCodePoint);
          const wanted = expected.map((code) => `${LIBRARY_NAME}/${code}`).sort(byCodePoint);
          expect(reported).toEqual(wanted);
        }

        const outputs: Record<string, string | undefined> = result.outputs;
        const content = outputs[`asyncapi.${fileType}`];
        if (content === undefined) {
          throw new Error(`The emitter wrote no asyncapi.${fileType} for ${name}.`);
        }
        // The other integration suites parse the output before asserting on
        // it. Parsing throws away exactly what this suite exists to protect,
        // so the raw text is compared.
        await expect(content).toMatchFileSnapshot(`${SNAPSHOTS}/${name}.${fileType}`);
      });
    }
  }

  it("has a spec for every committed snapshot", () => {
    const expected = new Set(
      names.flatMap((name) => variantsOf(name).map((v) => `${name}.${v.fileType}`)),
    );
    const committed = readdirSync(new URL(SNAPSHOTS + "/", import.meta.url));
    // A snapshot with no spec is never compared against anything, so it would
    // sit in the tree looking like a guard while guarding nothing.
    expect([...committed].sort(byCodePoint)).toEqual([...expected].sort(byCodePoint));
  });
});
