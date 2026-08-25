/**
 * The test host for this emitter.
 *
 * The library is named by package name, because that is how the compiler
 * resolves one. `findPackageRoot` walks up from this file, so it finds this
 * package rather than the workspace root.
 */

import { normalizePath, getDirectoryPath } from "@typespec/compiler";
import { createTester } from "@typespec/compiler/testing";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PACKAGE_NAME } from "./lib.js";

function findPackageRoot(fromUrl: string): string {
  let dir = getDirectoryPath(normalizePath(fileURLToPath(fromUrl)));
  while (!existsSync(`${dir}/package.json`)) {
    const parent = getDirectoryPath(dir);
    if (parent === dir) {
      throw new Error(`Cannot find package.json above ${fromUrl}`);
    }
    dir = parent;
  }
  return dir;
}

/**
 * Tester with this emitter imported and the `Avro` namespace in scope.
 *
 * @public
 */
export const AvroTester = createTester(findPackageRoot(import.meta.url), {
  libraries: [PACKAGE_NAME],
})
  .importLibraries()
  .using("Avro");
