import { getDirectoryPath, normalizePath } from "@typespec/compiler";
import { createTester } from "@typespec/compiler/testing";
import { fileURLToPath } from "node:url";
import { PACKAGE_NAME } from "#emitter/lib.js";

/**
 * The root of the emitter package.
 *
 * A tester resolves the libraries a case names from this directory, and the
 * optional schema libraries are development dependencies of the emitter
 * package rather than of the workspace root. So the resolution has to start
 * here. Nine test files walked up to it on their own before, each with a
 * different number of steps to keep right whenever a file moved.
 */
const EMITTER_PACKAGE_ROOT = normalizePath(
  getDirectoryPath(getDirectoryPath(getDirectoryPath(fileURLToPath(import.meta.url)))) +
    "/packages/tsp-asyncapi",
);

/**
 * Builds a tester that loads the emitter library and the ones named here.
 *
 * The emitter library is always loaded, because every case writes AsyncAPI
 * decorators. No emitter runs: a caller that wants one adds `emit` to the
 * tester this returns.
 *
 * @param libraries - The libraries to load beside the emitter
 * @returns A tester with the libraries imported and the namespace in scope
 */
export function createLibraryTester(...libraries: readonly string[]) {
  return createTester(EMITTER_PACKAGE_ROOT, { libraries: [PACKAGE_NAME, ...libraries] })
    .importLibraries()
    .using("AsyncAPI");
}
