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

export {
  $aliases,
  $decimal,
  $enumDefault,
  $fixed,
  $logicalType,
  $namespace,
  $order,
  $record,
  getAvroAliases,
  getAvroEnumDefault,
  getAvroFixedSize,
  getAvroLogicalType,
  getAvroNamespace,
  getAvroOrder,
  isRecord,
  listRecords,
  resolveAvroNamespace,
} from "./decorators/index.js";

export type { AvroLogicalTypeAnnotation } from "./decorators/index.js";

export { isAvroLogical, isAvroUnion } from "./types.js";

export type {
  AvroArray,
  AvroBranch,
  AvroDefault,
  AvroEnum,
  AvroField,
  AvroFieldOrder,
  AvroFixed,
  AvroLogical,
  AvroMap,
  AvroPrimitiveName,
  AvroRecord,
  AvroSchema,
  AvroUnion,
} from "./types.js";
