/**
 * The decorator surface of this package.
 *
 * Every name is listed on purpose. An `export *` publishes whatever a module
 * happens to export, and an `@internal` tag does not prevent that: it only
 * changes the API report.
 */

export { $namespace, getAvroNamespace, resolveAvroNamespace } from "./namespace.js";

export { $record, isRecord, listRecords } from "./record.js";
