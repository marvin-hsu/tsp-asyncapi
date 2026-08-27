import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Every file in a package's build output comes from a file in its source.
 *
 * `files: ["dist"]` packs the whole directory. TypeScript removes no file it
 * did not write in this run, so a source file that is renamed or deleted
 * leaves its output behind. That stale file is published, and a project that
 * imports it gets code no one maintains.
 *
 * The build now removes `dist` before it runs, so a stale file cannot
 * survive. This case is what proves the removal happens, and it reports the
 * offenders by name when it does not.
 */

/** The workspace root, as a path from this file. */
const ROOT = new URL("../../../", import.meta.url);

/** Every package the workspace publishes. */
const PACKAGES = ["tsp-asyncapi-core", "tsp-asyncapi", "tsp-avro"];

/** The manifest of one package. */
interface Manifest {
  scripts: Record<string, string>;
}

/**
 * The one file in `dist` that no source file explains.
 *
 * API Extractor writes it, and it names the TSDoc version the declarations
 * were written against. A TSDoc reader looks for it beside the types, so it
 * is published on purpose. The next build removes it with the rest of `dist`
 * and API Extractor writes it again.
 */
const WRITTEN_BY_API_EXTRACTOR = new Set(["src/tsdoc-metadata.json"]);

describe("Unit: the provenance of the build output", () => {
  it("maps each kind of emitted file back to its source", () => {
    // A mapper that knew one extension would pass while another kind of
    // orphan shipped.
    expect(sourceOf("src/lower/schemas.js")).toBe("src/lower/schemas.ts");
    expect(sourceOf("src/lower/schemas.d.ts")).toBe("src/lower/schemas.ts");
    expect(sourceOf("src/lower/schemas.js.map")).toBe("src/lower/schemas.ts");
    expect(sourceOf("src/lower/schemas.d.ts.map")).toBe("src/lower/schemas.ts");

    // A file outside `src` has no source to come from. The rollup of an API
    // report is one, and nothing in the manifest points at it.
    expect(sourceOf("tsp-asyncapi-core.d.ts")).toBeUndefined();
  });

  it.each(PACKAGES)("emits no file of %s that has no source", async (name) => {
    const sources = new Set(await filesIn(new URL(`packages/${name}/src/`, ROOT)));
    const emitted = await filesIn(new URL(`packages/${name}/dist/`, ROOT));

    // A build that never ran would also report no orphan.
    expect(emitted.length, `${name} was not built`).toBeGreaterThan(0);
    expect(sources.size, `${name} has no source`).toBeGreaterThan(0);

    const orphans = emitted.filter((file) => {
      if (WRITTEN_BY_API_EXTRACTOR.has(file)) return false;
      const source = sourceOf(file);
      return source === undefined || !sources.has(source.slice("src/".length));
    });

    expect(orphans, `${name} carries output no source file explains`).toEqual([]);
  });

  it.each(PACKAGES)("removes the build output of %s before it builds", async (name) => {
    const manifest = JSON.parse(
      await readFile(new URL(`packages/${name}/package.json`, ROOT), "utf8"),
    ) as Manifest;

    // `prebuild` runs before `build`, whichever command starts the build. So
    // the removal covers a root build, a filtered build and a release job
    // alike.
    expect(manifest.scripts.prebuild).toBe("pnpm run clean");
  });

  /**
   * `pnpm clean` runs pnpm's own command, not the script of that name. The
   * script is reached with `pnpm run clean`, and the removal is silently
   * skipped without the `run`.
   */
  it("reaches the clean script of every package from the root", async () => {
    const manifest = JSON.parse(await readFile(new URL("package.json", ROOT), "utf8")) as Manifest;

    expect(manifest.scripts.clean).toBe("pnpm run -r clean");
    // The root build compiles every package in one `tsc -b`, and reads no per
    // package script. So the root removes the output of all three itself.
    expect(manifest.scripts.prebuild).toBe("pnpm run clean");
  });
});

/**
 * The source file one emitted file comes from.
 *
 * TypeScript writes four files for one source: the JavaScript, the
 * declaration, and a source map for each. All four carry the source path
 * with a different extension.
 *
 * @param file - The emitted file, as a path from `dist`
 * @returns The source path, or undefined when the file comes from no source
 */
function sourceOf(file: string): string | undefined {
  if (!file.startsWith("src/")) return undefined;
  const emitted = file.endsWith(".map") ? file.slice(0, -".map".length) : file;
  if (emitted.endsWith(".d.ts")) return `${emitted.slice(0, -".d.ts".length)}.ts`;
  if (emitted.endsWith(".js")) return `${emitted.slice(0, -".js".length)}.ts`;
  return undefined;
}

/**
 * Every file below one directory.
 *
 * @param root - The directory to walk
 * @returns The path of each file, relative to that directory
 */
async function filesIn(root: URL): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true, recursive: true });
  const base = fileURLToPath(root);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(base, join(entry.parentPath, entry.name)));
}
