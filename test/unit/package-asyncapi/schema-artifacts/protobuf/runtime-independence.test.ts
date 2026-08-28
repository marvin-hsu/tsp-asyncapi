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

  it("recognizes every form that would load the library", () => {
    // A guard that saw one form would pass while another form shipped.
    expect(loadsOfficialLibrary('import { x } from "@typespec/protobuf";')).toBe(true);
    expect(loadsOfficialLibrary('import "@typespec/protobuf";')).toBe(true);
    expect(loadsOfficialLibrary('await import("@typespec/protobuf")')).toBe(true);
    expect(loadsOfficialLibrary('require("@typespec/protobuf")')).toBe(true);
    expect(loadsOfficialLibrary("import x from '@typespec/protobuf/testing';")).toBe(true);

    // The state keys spell the package name and load nothing.
    expect(loadsOfficialLibrary('Symbol.for("@typespec/protobuf.fieldIndex")')).toBe(false);
    expect(loadsOfficialLibrary("// this file reads @typespec/protobuf state")).toBe(false);
  });

  it("names the official library in no source file of either package", async () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const root of SOURCE_ROOTS) {
      for (const file of await typeScriptFilesIn(root)) {
        scanned += 1;
        const text = await readFile(file, "utf8");
        if (loadsOfficialLibrary(text)) offenders.push(file);
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

    const workspacePath = fileURLToPath(new URL("../../../../../package.json", import.meta.url));
    const workspace = JSON.parse(await readFile(workspacePath, "utf8")) as {
      devDependencies: Record<string, string>;
    };

    expect(manifest.dependencies["@typespec/protobuf"]).toBeUndefined();

    // The version is exact, so the judge cannot drift under a caret range.
    // The number itself is read here rather than written down. An upgrade
    // moves it, and this case is about the shape rather than the number.
    const pinned = manifest.devDependencies["@typespec/protobuf"];
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
    // The parity oracle runs from the workspace root, so both manifests have
    // to install the same judge.
    expect(workspace.devDependencies["@typespec/protobuf"]).toBe(pinned);

    // The peer range is the minor line of the pinned version. A range that
    // leaves the tested version out tells a project to install a version
    // nothing here runs against. So an upgrade across a minor line fails
    // this case until the range follows it.
    expect(manifest.peerDependencies["@typespec/protobuf"]).toBe(minorLineOf(pinned));
    expect(manifest.peerDependenciesMeta["@typespec/protobuf"]?.optional).toBe(true);
  });
});

/**
 * The minor line one exact version belongs to.
 *
 * @param version - An exact version, such as `1.2.3`
 * @returns The range of its minor line, such as `1.2.x`
 */
function minorLineOf(version: string): string {
  return `${version.split(".").slice(0, 2).join(".")}.x`;
}

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
 * Whether a text loads the official library.
 *
 * Every specifier form counts: a static import, a side effect import, a
 * dynamic import, and a `require` call. Each of them is a run time
 * dependency.
 *
 * The closing quote sits right after the package name or after a subpath of
 * it. That keeps the `Symbol.for("@typespec/protobuf.<key>")` state keys out,
 * because those spell the name and load nothing.
 *
 * @param text - The source text to judge
 * @returns Whether the text loads the library
 */
function loadsOfficialLibrary(text: string): boolean {
  return LOADS_OFFICIAL_LIBRARY.test(text);
}

/** The specifier of the official library, with any subpath of it. */
const SPECIFIER = String.raw`["']@typespec\/protobuf(?:\/[^"']*)?["']`;

/**
 * Every form that loads the library.
 *
 * The two branches stay apart so the expression never backtracks. One covers
 * `from "x"` and `import "x"`. The other covers `import("x")` and
 * `require("x")`.
 */
const LOADS_OFFICIAL_LIBRARY = new RegExp(
  String.raw`(?:from|import)\s+${SPECIFIER}|(?:import|require)\s*\(\s*${SPECIFIER}`,
);
