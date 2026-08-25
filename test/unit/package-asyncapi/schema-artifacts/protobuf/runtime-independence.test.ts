import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The one promise this preview feature rests on: nothing at run time imports
 * `@typespec/protobuf`.
 *
 * The author's project loads that library and its decorators write their
 * state. This emitter reads that state through `Symbol.for`, which needs the
 * library itself nowhere. So a project that uses none of it installs none of
 * it, and this package ships no dependency on it.
 *
 * The library is still a development dependency, because the parity oracle
 * runs the official emitter as its judge. That is the only place it may
 * appear, and this case is what keeps it there.
 */
describe("Unit: Protobuf run time independence (Phase 16 W1)", () => {
  /** The two published packages, as paths from this file. */
  const SOURCE_ROOTS = ["tsp-asyncapi-core", "tsp-asyncapi"].map((name) =>
    fileURLToPath(new URL(`../../../../../packages/${name}/src`, import.meta.url)),
  );

  it("names the official library in no source file of either package", async () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const root of SOURCE_ROOTS) {
      for (const file of await typeScriptFilesIn(root)) {
        scanned += 1;
        const text = await readFile(file, "utf8");
        // The import forms differ, and the package name is in all of them.
        if (/from\s+["']@typespec\/protobuf/.test(text)) offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
    // A scan that found no file would also report no offender.
    expect(scanned).toBeGreaterThan(0);
  });

  it("declares the official library as a development dependency only", async () => {
    const manifestPath = fileURLToPath(
      new URL("../../../../../packages/tsp-asyncapi/package.json", import.meta.url),
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      peerDependencies: Record<string, string>;
      peerDependenciesMeta: Record<string, { optional?: boolean } | undefined>;
    };

    expect(manifest.dependencies["@typespec/protobuf"]).toBeUndefined();
    // The version is exact, so the judge cannot drift under a caret range.
    expect(manifest.devDependencies["@typespec/protobuf"]).toBe("0.85.0");
    expect(manifest.peerDependencies["@typespec/protobuf"]).toBe("0.85.x");
    expect(manifest.peerDependenciesMeta["@typespec/protobuf"]?.optional).toBe(true);
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
