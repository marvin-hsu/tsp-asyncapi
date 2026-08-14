import { normalizePath, getDirectoryPath } from "@typespec/compiler";
import { createTester } from "@typespec/compiler/testing";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { LIBRARY_NAME } from "../lib.js";

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
 * Tester pre-configured with the typespec-asyncapi library imported and the
 * `AsyncAPI` namespace in scope.
 *
 * @public
 */
export const AsyncAPITester = createTester(findPackageRoot(import.meta.url), {
  libraries: [LIBRARY_NAME],
})
  .importLibraries()
  .using("AsyncAPI");
