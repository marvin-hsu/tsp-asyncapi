/**
 * The test host for this emitter.
 *
 * `tsp-asyncapi-core` ships a tester too, and that one loads the decorators
 * alone. This one loads this package, whose `lib/main.tsp` forwards to core, so
 * a test gets the decorators and the emitter together.
 *
 * The library is named by package name, because that is how the compiler
 * resolves one. `findPackageRoot` walks up from this file, so it finds this
 * package rather than the workspace root.
 */

import { normalizePath, getDirectoryPath } from "@typespec/compiler";
import { createTester } from "@typespec/compiler/testing";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { PACKAGE_NAME } from "../lib.js";

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
 * Tester pre-configured with this emitter imported and the `AsyncAPI` namespace
 * in scope.
 *
 * @public
 */
export const AsyncAPITester = createTester(findPackageRoot(import.meta.url), {
  libraries: [PACKAGE_NAME],
})
  .importLibraries()
  .using("AsyncAPI");
