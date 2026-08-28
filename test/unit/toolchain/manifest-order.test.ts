import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * Every dependency map of every manifest, in alphabetical order.
 *
 * A dependency map is read by hand more often than it is written. The order
 * is what makes a name findable, and what keeps two branches that each add a
 * package from touching the same line. Prettier formats the file and leaves
 * the key order alone, so no other check in the workspace reads it.
 */

/** The workspace root, as a path from this file. */
const ROOT = new URL("../../../", import.meta.url);

/** Every manifest of the workspace, as a path from the root. */
const MANIFESTS = [
  "package.json",
  "packages/tsp-asyncapi-core/package.json",
  "packages/tsp-asyncapi/package.json",
  "packages/tsp-avro/package.json",
];

/** The maps a manifest states its dependencies in. */
const MAPS = ["dependencies", "devDependencies", "peerDependencies"] as const;

/** The part of a manifest these cases read. */
type Manifest = Partial<Record<(typeof MAPS)[number], Record<string, string>>>;

describe("Unit: the order of the manifest dependencies", () => {
  it.each(MANIFESTS)("keeps every dependency map of %s in order", async (path) => {
    const manifest = JSON.parse(await readFile(new URL(path, ROOT), "utf8")) as Manifest;

    // A manifest that declares none of the three maps would pass every case
    // below without stating anything.
    expect(
      MAPS.some((map) => manifest[map] !== undefined),
      `${path} declares no dependency`,
    ).toBe(true);

    for (const map of MAPS) {
      const names = Object.keys(manifest[map] ?? {});
      expect(names, `${path} ${map}`).toStrictEqual(
        [...names].sort((one, other) => one.localeCompare(other, "en")),
      );
    }
  });
});
