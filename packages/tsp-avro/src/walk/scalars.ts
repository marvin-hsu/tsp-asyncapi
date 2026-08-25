/**
 * The TypeSpec scalar to Avro primitive table.
 *
 * Avro has eight primitive types and no unsigned integer. So the table is
 * short, and a TypeSpec scalar with no entry is refused rather than widened:
 * `uint32` fits in no Avro primitive without changing what it means.
 *
 * A scalar the author declared is matched through its base. `scalar Age
 * extends int32` has no entry of its own, and its base does, so it maps to
 * `int`. This is the rule the upstream Protobuf emitter uses, and it is what
 * lets a project name its own scalars without teaching this table about them.
 *
 * The table is built for one program, because a TypeSpec type is only the same
 * object inside one program. It is built once per emit and passed down the
 * walk, so nothing outlives the emit that made it.
 */

import { formatDiagnostic, type Program, type Scalar, type Type } from "@typespec/compiler";
import type { AvroPrimitiveName } from "../types.js";

/**
 * The entries of the table, by TypeSpec name.
 *
 * `int64` maps to `long` and `float64` to `double`, because Avro names the
 * same widths differently.
 */
const SCALAR_ENTRIES: readonly (readonly [string, AvroPrimitiveName])[] = [
  ["TypeSpec.boolean", "boolean"],
  ["TypeSpec.bytes", "bytes"],
  ["TypeSpec.string", "string"],
  ["TypeSpec.int32", "int"],
  ["TypeSpec.int64", "long"],
  ["TypeSpec.float32", "float"],
  ["TypeSpec.float64", "double"],
];

/**
 * The table, resolved against one program.
 *
 * @internal
 */
export type AvroScalarTable = ReadonlyMap<Type, AvroPrimitiveName>;

/**
 * Builds the table for one program.
 *
 * A reference that fails to resolve is a defect in this file, not in the
 * program being compiled, so it throws instead of reporting a diagnostic.
 *
 * @internal
 */
export function createScalarTable(program: Program): AvroScalarTable {
  const table = new Map<Type, AvroPrimitiveName>();
  for (const [reference, primitive] of SCALAR_ENTRIES) {
    const [type, diagnostics] = program.resolveTypeReference(reference);
    if (!type) {
      const detail = diagnostics.map((diagnostic) => formatDiagnostic(diagnostic)).join("\n");
      throw new Error(`Cannot resolve the TypeSpec scalar ${reference}: ${detail}`);
    }
    table.set(type, primitive);
  }
  return table;
}

/**
 * Finds the Avro primitive a scalar maps to.
 *
 * @param table - The table for the program the scalar belongs to
 * @param target - The scalar to map
 * @returns The primitive name, or undefined when neither the scalar nor any
 * of its bases has an entry
 *
 * @internal
 */
export function avroScalarFor(
  table: AvroScalarTable,
  target: Scalar,
): AvroPrimitiveName | undefined {
  let current: Scalar | undefined = target;
  while (current) {
    const primitive = table.get(current);
    if (primitive !== undefined) {
      return primitive;
    }
    current = current.baseScalar;
  }
  return undefined;
}
