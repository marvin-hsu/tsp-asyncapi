/**
 * The test host for this emitter.
 *
 * `tsp-asyncapi-core` ships a decorators-only tester. This one loads this
 * package instead, whose `lib/main.tsp` forwards to core, so a test gets
 * both the decorators and the emitter.
 *
 * The library is named by package name, the way the compiler resolves one.
 * `findPackageRoot` walks up from this file to find this package, not the
 * workspace root.
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
 * Tester pre-configured with this emitter and the `AsyncAPI` namespace in scope.
 *
 * @public
 */
export const AsyncAPITester = createTester(findPackageRoot(import.meta.url), {
  libraries: [PACKAGE_NAME],
})
  .importLibraries()
  .using("AsyncAPI");
