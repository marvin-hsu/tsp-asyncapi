import { normalizePath, getDirectoryPath } from "@typespec/compiler";
import { createTester } from "@typespec/compiler/testing";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
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
 * Tester pre-configured with this library imported and the `AsyncAPI` namespace
 * in scope.
 *
 * It loads the decorators and nothing else. No emitter is registered, so a test
 * using this tester can check what a decorator recorded but cannot emit a
 * document. Use the tester in the emitter package for that.
 *
 * @public
 */
export const AsyncAPITester = createTester(findPackageRoot(import.meta.url), {
  libraries: [PACKAGE_NAME],
})
  .importLibraries()
  .using("AsyncAPI");
