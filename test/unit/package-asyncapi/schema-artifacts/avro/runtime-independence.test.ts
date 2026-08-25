/**
 * The one promise this preview feature rests on: nothing loads `tsp-avro`
 * until a project asks for it.
 *
 * That library is experimental and this package is not. A static import would
 * make every project that installs this emitter install that one too, and
 * would tie a stable release to a `0.x` range. So the provider loads it with a
 * dynamic import inside `collect`, which runs only when `preview-features`
 * names `avro`.
 *
 * The dynamic import in `schema-artifacts/avro.ts` is the point of the
 * arrangement, so it is not an offender. What this case forbids is a static
 * import: that one runs when the module is loaded, whatever the project asked
 * for.
 *
 * The library is a development dependency, because the tests compile sources
 * that carry its decorators. It is an optional peer dependency, because a
 * project that turns the feature on has to install it itself.
 */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Unit: Avro run time independence", () => {
  /** The three published packages, as paths from this file. */
  const SOURCE_ROOTS = ["tsp-asyncapi-core", "tsp-asyncapi"].map((name) =>
    fileURLToPath(new URL(`../../../../../packages/${name}/src`, import.meta.url)),
  );

  it("tells a static import from every form that is allowed", () => {
    // A guard that saw one form would pass while another form shipped.
    expect(staticallyImportsAvro('import { listRecords } from "tsp-avro";')).toBe(true);
    expect(staticallyImportsAvro('import "tsp-avro";')).toBe(true);
    expect(staticallyImportsAvro('import { renderAvroSchema } from "tsp-avro/unstable";')).toBe(
      true,
    );
    expect(staticallyImportsAvro("import x from 'tsp-avro/testing';")).toBe(true);

    // The dynamic import is the arrangement itself, and a type position names
    // a module without loading one. A state key spells the name and loads
    // nothing at all.
    expect(staticallyImportsAvro('await import("tsp-avro/unstable")')).toBe(false);
    expect(staticallyImportsAvro('readonly main: typeof import("tsp-avro");')).toBe(false);
    expect(staticallyImportsAvro('Symbol.for("tsp-avro.record")')).toBe(false);
  });

  it("imports the library statically in no source file of either package", async () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const root of SOURCE_ROOTS) {
      for (const file of await typeScriptFilesIn(root)) {
        scanned += 1;
        const text = await readFile(file, "utf8");
        if (staticallyImportsAvro(text)) offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
    // A scan that found no file would also report no offender.
    expect(scanned).toBeGreaterThan(0);
  });

  it("declares the library as an optional peer and a development dependency", async () => {
    const manifestPath = fileURLToPath(
      new URL("../../../../../packages/tsp-asyncapi/package.json", import.meta.url),
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      peerDependencies: Record<string, string>;
      peerDependenciesMeta: Record<string, { optional?: boolean } | undefined>;
    };

    // Nothing in `dependencies`: a project that never turns the feature on
    // installs nothing extra.
    expect(manifest.dependencies["tsp-avro"]).toBeUndefined();
    expect(manifest.devDependencies["tsp-avro"]).toBe("workspace:~");
    // The range is the experimental line. It moves when that package does.
    expect(manifest.peerDependencies["tsp-avro"]).toBe("0.1.x");
    expect(manifest.peerDependenciesMeta["tsp-avro"]?.optional).toBe(true);
  });
});

/**
 * Every `.ts` file below one directory.
 *
 * @param root - The directory to walk
 * @returns The absolute path of each TypeScript file under it
 */
async function typeScriptFilesIn(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => `${entry.parentPath}/${entry.name}`);
}

/**
 * Whether a text imports the library statically.
 *
 * A static import loads the module when this one is loaded. That is the form
 * this feature must not ship. The dynamic form is what the provider uses, and
 * a `typeof import(...)` type is erased before anything runs.
 *
 * The closing quote sits right after the package name or after a subpath of
 * it, which keeps a `Symbol.for("tsp-avro.<key>")` state key out.
 *
 * @param text - The source text to judge
 * @returns Whether the text imports the library statically
 */
function staticallyImportsAvro(text: string): boolean {
  return STATIC_IMPORT.test(text);
}

/** The specifier of the library, with any subpath of it. */
const SPECIFIER = String.raw`["']tsp-avro(?:\/[^"']*)?["']`;

/**
 * The two static forms.
 *
 * One is `from "x"`, which covers every named, default and type import. The
 * other is `import "x"`, the side effect form. Both need whitespace before
 * the quote, and a dynamic `import("x")` has a parenthesis there instead.
 */
const STATIC_IMPORT = new RegExp(String.raw`(?:from|import)\s+${SPECIFIER}`);
