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
  /**
   * The two packages that must not load the library, as paths from this file.
   *
   * The workspace publishes three. `tsp-avro` is left out because it is the
   * library this case guards.
   */
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

  it("names the library as a build time reference of this package", async () => {
    const configPath = fileURLToPath(
      new URL("../../../../../packages/tsp-asyncapi/tsconfig.json", import.meta.url),
    );
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      references: { path: string }[];
    };

    // The provider names the library in a type position, so the build needs
    // its declarations before this package compiles. Without the reference
    // `tsc -b` picks the order itself, and a clean checkout builds this
    // package first and fails. A tree that already holds `dist` hides that.
    expect(config.references.map((reference) => reference.path)).toContain("../tsp-avro");
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
    // The library is developed here, so the development dependency is the
    // copy in this workspace rather than a published version.
    expect(manifest.devDependencies["tsp-avro"]).toMatch(/^workspace:/);
    // The range is the experimental line. It moves when that package does,
    // so the line is a shape here. Which line it has to be is read from the
    // library's own manifest by the case below.
    expect(manifest.peerDependencies["tsp-avro"]).toMatch(/^\d+\.\d+\.x$/);
    expect(manifest.peerDependenciesMeta["tsp-avro"]?.optional).toBe(true);
  });

  /**
   * The range has to admit the version the next publish produces.
   *
   * The range above is read from the manifest, and the guides are checked
   * against that same manifest. So all three agree with each other and none of
   * them agrees with the release. The pending changesets decide the version
   * the library publishes, and a range that leaves that version out means the
   * install command in the guides resolves to nothing.
   */
  it("declares a peer range the pending release of the library satisfies", async () => {
    const root = new URL("../../../../../", import.meta.url);
    const manifest = JSON.parse(
      await readFile(new URL("packages/tsp-asyncapi/package.json", root), "utf8"),
    ) as { peerDependencies: Record<string, string> };
    const library = JSON.parse(
      await readFile(new URL("packages/tsp-avro/package.json", root), "utf8"),
    ) as { version: string };

    const changesets = new URL(".changeset/", root);
    const names = (await readdir(changesets)).filter(
      (name) => name.endsWith(".md") && name !== "README.md",
    );
    const bumps: string[] = [];
    for (const name of names) {
      const bump = bumpOf(await readFile(new URL(name, changesets), "utf8"), "tsp-avro");
      if (bump !== undefined) bumps.push(bump);
    }
    // The library carries no changeset of its own while its first release is
    // still unpublished, so the version it publishes is the version in the
    // manifest. A changeset for it later moves that version, and the range
    // has to follow. Both cases are read here, so neither is a surprise.
    //
    // Changesets applies the strongest release type of the set, once.
    const strongest = bumps.reduce<string | undefined>(
      (held, bump) =>
        held === undefined || BUMP_ORDER.indexOf(bump) > BUMP_ORDER.indexOf(held) ? bump : held,
      undefined,
    );
    const release = strongest === undefined ? library.version : bumped(library.version, strongest);

    const range = manifest.peerDependencies["tsp-avro"];
    expect(range).toMatch(/^\d+\.\d+\.x$/);
    expect(`${release.split(".").slice(0, 2).join(".")}.x`, `release ${release}`).toBe(range);
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

/**
 * The bump each pending changeset asks for on one package.
 *
 * A changeset names its packages in a YAML front matter block. Only the lines
 * of that block that name this package matter here.
 *
 * @param text - The whole changeset file
 * @param name - The package to read the bump of
 * @returns The release type, or undefined when the file leaves the package out
 */
function bumpOf(text: string, name: string): string | undefined {
  return new RegExp(String.raw`^"${name}":\s*(major|minor|patch)\s*$`, "m").exec(text)?.[1];
}

/**
 * The version a release type produces from a version.
 *
 * @param version - The version the manifest declares
 * @param bump - The release type
 * @returns The version the release publishes
 */
function bumped(version: string, bump: string): string {
  const [major, minor, patch] = version.split(".").map(Number);
  if (bump === "major") return [major + 1, 0, 0].join(".");
  if (bump === "minor") return [major, minor + 1, 0].join(".");
  return [major, minor, patch + 1].join(".");
}

/** The order of the three release types, strongest last. */
const BUMP_ORDER = ["patch", "minor", "major"];
