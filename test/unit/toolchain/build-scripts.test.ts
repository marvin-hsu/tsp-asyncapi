import { readFile, stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * The per package build scripts, checked against the files they name.
 *
 * The workspace root builds every package with one `tsc -b` over
 * `tsconfig.ws.json`. That command hides a broken per package script,
 * because it never reads one. A release job, a `pnpm -r build` and a
 * `--filter` run all read them, so a script that names a missing project
 * file fails only there.
 */

/** The workspace root, as a path from this file. */
const ROOT = new URL("../../../", import.meta.url);

/** Every package the workspace publishes. */
const PACKAGES = ["tsp-asyncapi-core", "tsp-asyncapi", "tsp-avro"];

/** The manifest of one package. */
interface Manifest {
  scripts: Record<string, string>;
}

describe("Unit: the per package build scripts", () => {
  it.each(PACKAGES)("builds %s from a project file that exists", async (name) => {
    const manifest = JSON.parse(
      await readFile(new URL(`packages/${name}/package.json`, ROOT), "utf8"),
    ) as Manifest;

    const project = projectOf(manifest.scripts.build);
    expect(project, `${name} build script`).toBeDefined();

    const path = new URL(`packages/${name}/${project ?? ""}`, ROOT);
    await expect(stat(path), `${name}/${project ?? ""}`).resolves.toBeDefined();
  });
});

/**
 * The project file a `tsc` command reads.
 *
 * Both `-p` and `-b` name one. The path is relative to the package, because
 * the script runs there.
 *
 * @param script - The build script of one package
 * @returns The project path, or undefined when the script names none
 */
function projectOf(script: string): string | undefined {
  return /\btsc\s+-[pb]\s+(\S+)/.exec(script)?.[1];
}
