import { DiagnosticTarget, Namespace, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { bySourcePosition, SourcePosition } from "../source-order.js";

const useSecurityStateKey = Symbol.for("tsp-asyncapi.useSecurity");

/**
 * One `@useSecurity` application.
 * The source position orders the applications, because evaluation order
 * differs between a stacked decorator and an augment decorator.
 */
export interface UseSecurityRecord extends SourcePosition {
  /** The name of the scheme this application asks for. */
  schemeName: string;
  /** Where to report a problem about this application. */
  target: DiagnosticTarget;
}

const [getUseSecurityInternal, setUseSecurity, getUseSecurityStateMap] = useStateMap<
  Namespace,
  UseSecurityRecord[]
>(useSecurityStateKey);

export { getUseSecurityInternal, setUseSecurity };

/**
 * Lists the `@useSecurity` applications of one namespace, in source order.
 *
 * A name given more than once yields one record. AsyncAPI reads the
 * `security` array as OR, so a repeated name adds nothing. The first
 * application in source order is the one kept, so the diagnostic target
 * points at the place the author wrote the name first.
 *
 * This is the one place the order and the deduplication are decided. The
 * public name reader and the server builder both read it, so both see the
 * same list.
 *
 * @param program - The program to read the state from
 * @param target - The namespace the decorator was applied to
 * @returns The applications to emit, in source order
 */
export function listUsedSecuritySchemes(program: Program, target: Namespace): UseSecurityRecord[] {
  const records = [...(getUseSecurityInternal(program, target) ?? [])].sort(
    bySourcePosition(program),
  );
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.schemeName)) return false;
    seen.add(record.schemeName);
    return true;
  });
}

/**
 * One `@useSecurity` that the emitter leaves out of the document, because
 * its namespace declares no server.
 */
export interface StraySecurityUseRecord {
  /** The namespace that carries this `@useSecurity`. */
  namespace: Namespace;
  /** The scheme name it asks for. */
  schemeName: string;
  /** Where to report a problem about this application. */
  target: DiagnosticTarget;
}

/**
 * Lists the `@useSecurity` applications that reach no server.
 *
 * The emitter writes the `security` array onto a server. A namespace with
 * no `@server` therefore has nowhere to put it, and the application does
 * nothing. Dropping it in silence hides an author mistake.
 *
 * @param program - The program to read the state from
 * @param hasServers - Answers whether a namespace declares a server
 * @returns The stray applications, in source order
 */
export function listSecurityUsesWithoutServer(
  program: Program,
  hasServers: (namespace: Namespace) => boolean,
): StraySecurityUseRecord[] {
  const stray: { namespace: Namespace; record: UseSecurityRecord }[] = [];
  for (const [namespace, records] of getUseSecurityStateMap(program)) {
    if (hasServers(namespace)) continue;
    for (const record of records) stray.push({ namespace, record });
  }

  stray.sort(
    (
      (compare) => (a, b) =>
        compare(a.record, b.record)
    )(bySourcePosition(program)),
  );

  return stray.map(({ namespace, record }) => ({
    namespace,
    schemeName: record.schemeName,
    target: record.target,
  }));
}
