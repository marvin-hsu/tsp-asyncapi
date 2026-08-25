/**
 * The entry point the TypeSpec compiler loads to find decorator
 * implementations.
 *
 * `lib/main.tsp` imports the built copy of this file. So the compiler runs the
 * build output, not the source. Build the package before you compile anything
 * that uses a decorator from it.
 *
 * This library declares no decorator yet, so this file exports the library
 * definition alone.
 */

export { $lib } from "./lib.js";
