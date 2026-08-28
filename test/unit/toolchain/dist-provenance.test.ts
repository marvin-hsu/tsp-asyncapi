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
 * The packaging path removes `dist` before it rebuilds, so no stale file
 * reaches a tarball. These cases prove the removal happens on that path, and
 * they report the offenders by name when the working output holds one.
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
 * is published on purpose. The packaging path removes it with the rest of
 * `dist`, so only a later API Extractor run puts it back.
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

  /**
   * A package that was never built has no `dist` at all. The listing
   * reports that as no file, rather than throwing.
   */
  it("lists a directory that does not exist as no file", async () => {
    await expect(filesIn(new URL("packages/tsp-asyncapi/dist-absent/", ROOT))).resolves.toEqual([]);
  });

  it.each(PACKAGES)("removes the build output of %s before it builds", async (name) => {
    const manifest = JSON.parse(
      await readFile(new URL(`packages/${name}/package.json`, ROOT), "utf8"),
    ) as Manifest;

    // `prebuild` runs before any command that starts `build`, so this
    // covers `pnpm -r build` and a filtered build alike. The root's own
    // `tsc -b` build removes all three packages' output via `check:package`.
    expect(manifest.scripts.prebuild).toBe("pnpm run clean");
  });

  it("rebuilds and regenerates the API Extractor output before it packs", async () => {
    const manifest = JSON.parse(await readFile(new URL("package.json", ROOT), "utf8")) as Manifest;
    const steps = manifest.scripts["check:package"].split("&&").map((step) => step.trim());

    // The step that packs the tarballs. Everything before it decides what
    // the tarballs hold.
    const pack = steps.findIndex((step) => step.includes("-r check:package"));
    expect(pack, "the root check:package packs nothing").toBeGreaterThanOrEqual(0);

    const before = steps.slice(0, pack);

    // The pack must follow its own build. Without one, the tarballs hold
    // whatever stale `dist` the checkout carried, the state this suite
    // guards against.
    const rebuild = before.findIndex((step) => step.endsWith("build"));
    expect(
      rebuild,
      "the root check:package packs an output it did not build",
    ).toBeGreaterThanOrEqual(0);

    // A rebuild removes `dist`, and `tsdoc-metadata.json` with it. Only API
    // Extractor writes that file back, so it has to run again before the
    // pack, or the tarballs go out without it.
    expect(
      before.slice(rebuild + 1).some((step) => step.includes("api-extractor")),
      "the rebuild drops tsdoc-metadata.json from the tarballs",
    ).toBe(true);
  });

  it("removes the build output the root itself carries", async () => {
    const manifest = JSON.parse(await readFile(new URL("package.json", ROOT), "utf8")) as Manifest;

    // A checkout may still hold a stale root-level `dist` and `temp` from
    // before the workspace split into three packages. The recursive clean
    // reaches only the packages, so the root removes its own.
    expect(manifest.scripts.clean).toContain("./dist");
    expect(manifest.scripts.clean).toContain("./temp");
  });

  /**
   * pnpm has a `clean` command of its own, and `pnpm -r clean` reaches that
   * command rather than the script of the same name. The command takes no
   * `--recursive`, so it exits 1 with `Unknown option: 'recursive'` and
   * removes nothing.
   *
   * `pnpm run -r clean` reaches the script of every package. The `run` is
   * what tells pnpm to look at the scripts.
   */
  it("reaches the clean script of every package from the root", async () => {
    const manifest = JSON.parse(await readFile(new URL("package.json", ROOT), "utf8")) as Manifest;

    expect(manifest.scripts.clean).toContain("pnpm run -r clean");
  });

  /**
   * The removal belongs to the packaging path alone.
   *
   * `clean` removes `temp/tsconfig.tsbuildinfo` along with `dist`. Running
   * it before every root build would force `pnpm test` and `pnpm check` to
   * compile from nothing each time. Only `check:package` needs that
   * removal, to keep a stale `dist` out of the tarball.
   */
  it("removes the whole workspace output before it packs", async () => {
    const manifest = JSON.parse(await readFile(new URL("package.json", ROOT), "utf8")) as Manifest;
    const steps = manifest.scripts["check:package"].split("&&").map((step) => step.trim());

    expect(steps[0]).toBe("pnpm run clean");
    expect(manifest.scripts.prebuild, "every root build starts from nothing").toBeUndefined();
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
 * A directory that does not exist holds no file, so it is reported as an
 * empty listing. A package that was never built has no `dist`, and the case
 * that reads it says so in its own words instead of failing on the read.
 *
 * @param root - The directory to walk
 * @returns The path of each file, relative to that directory
 */
async function filesIn(root: URL): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true, recursive: true }).catch(
    (error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
      throw error;
    },
  );
  const base = fileURLToPath(root);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(base, join(entry.parentPath, entry.name)));
}
