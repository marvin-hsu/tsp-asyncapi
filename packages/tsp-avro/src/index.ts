/**
 * The public API of this package.
 *
 * Every name is listed on purpose. An `export *` publishes whatever a module
 * happens to export, and an `@internal` tag does not prevent that: it only
 * changes the API report.
 *
 * This package is experimental. Every name here may change in any release.
 */

export { $onEmit } from "./emitter.js";

export { $lib, PACKAGE_NAME } from "./lib.js";

export type { AvroEmitterOptions } from "./lib.js";
