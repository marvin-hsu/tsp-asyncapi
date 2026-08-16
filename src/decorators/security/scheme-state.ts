import { DiagnosticTarget, Namespace, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { SecuritySchemeObject } from "../../types.js";
import { bySourcePosition, SourcePosition } from "../../source-order.js";

const securitySchemeStateKey = Symbol.for("tsp-asyncapi.securityScheme");

/**
 * One security scheme declared by `@securityScheme`.
 * The scheme holds the fields of the AsyncAPI Security Scheme Object. The
 * name is the key it takes in `components.securitySchemes`.
 * @internal
 */
export interface AsyncAPISecuritySchemeState {
  /** The key this scheme takes in `components.securitySchemes`. */
  name: string;
  /** The scheme itself, ready to emit. */
  scheme: SecuritySchemeObject;
}

/**
 * One `@securityScheme` application, with the source position it was
 * written at. The position orders the schemes and picks the winner of a
 * name clash.
 */
export interface SecuritySchemeRecord extends SourcePosition {
  state: AsyncAPISecuritySchemeState;
  /** Where to report a problem about the name of this application. */
  nameTarget: DiagnosticTarget;
}

// The state is keyed by namespace, the same as the servers. The schemes are
// read back across the whole program though, because
// `components.securitySchemes` is a document-wide registry. A server reaches
// a scheme by name, so the namespace a scheme sits on does not matter.
const [getSecuritySchemesInternal, setSecuritySchemes, getSecuritySchemeStateMap] = useStateMap<
  Namespace,
  SecuritySchemeRecord[]
>(securitySchemeStateKey);

export { getSecuritySchemesInternal, setSecuritySchemes };

/**
 * Lists every security scheme the program declares, in source order.
 *
 * @param program - The program to read the state from
 * @returns The declared schemes. The list is empty when the program
 * declares none.
 */
export function listSecuritySchemes(program: Program): AsyncAPISecuritySchemeState[] {
  const records: SecuritySchemeRecord[] = [];
  for (const [, namespaceRecords] of getSecuritySchemeStateMap(program)) {
    records.push(...namespaceRecords);
  }
  records.sort(bySourcePosition(program));
  return records.map((record) => record.state);
}

/**
 * Where a scheme with one name already sits.
 * The caller replaces the record in place when the new application turns
 * out to be the earlier one, so it needs the list and the index, not only
 * the record.
 */
export interface SecuritySchemeSlot {
  /** The list that holds the record. It is the state of one namespace. */
  records: SecuritySchemeRecord[];
  /** The position of the record inside that list. */
  index: number;
}

/**
 * Finds the scheme that already claims one name, anywhere in the program.
 *
 * The name is the key of a document-wide registry, so two schemes with one
 * name clash even when they sit on different namespaces.
 *
 * @param program - The program to read the state from
 * @param name - The name to look for
 * @returns Where that scheme sits, or `undefined` when the name is free
 */
export function findSecuritySchemeByName(
  program: Program,
  name: string,
): SecuritySchemeSlot | undefined {
  for (const [, records] of getSecuritySchemeStateMap(program)) {
    const index = records.findIndex((record) => record.state.name === name);
    if (index >= 0) return { records, index };
  }
  return undefined;
}
