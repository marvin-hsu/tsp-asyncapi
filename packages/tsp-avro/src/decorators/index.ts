/**
 * The decorator surface of this package.
 *
 * Every name is listed on purpose. An `export *` would publish whatever a
 * module exports. An `@internal` tag does not stop that; it only changes the
 * API report.
 */

export { $aliases, getAvroAliases } from "./aliases.js";

export type { AvroAliasTarget } from "./aliases.js";

export { $decimal, $logicalType, getAvroLogicalType } from "./logical-type.js";

export type { AvroLogicalTypeAnnotation } from "./logical-type.js";

export { $enumDefault, getAvroEnumDefault } from "./enum-default.js";

export { $fixed, getAvroFixedSize } from "./fixed.js";

export { $namespace, getAvroNamespace, resolveAvroNamespace } from "./namespace.js";

export { $order, getAvroOrder } from "./order.js";

export { $record, isRecord, listRecords } from "./record.js";
