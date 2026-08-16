import { DiagnosticTarget, Namespace, Operation, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { bySourcePosition, SourcePosition } from "../../source-order.js";

const useSecurityStateKey = Symbol.for("tsp-asyncapi.useSecurity");

/**
 * The two types `@useSecurity` can be applied to.
 *
 * A namespace requires the scheme on every server it declares. An operation
 * requires the scheme on that operation alone, on top of what the server
 * already requires.
 * @public
 */
export type UseSecurityTarget = Namespace | Operation;

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
  UseSecurityTarget,
  UseSecurityRecord[]
>(useSecurityStateKey);

export { getUseSecurityInternal, setUseSecurity };

/**
 * Lists the `@useSecurity` applications of one target, in source order.
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
 * @param target - The namespace or operation the decorator was applied to
 * @returns The applications to emit, in source order
 */
export function listUsedSecuritySchemes(
  program: Program,
  target: UseSecurityTarget,
): UseSecurityRecord[] {
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
  for (const [target, records] of getUseSecurityStateMap(program)) {
    // An operation is skipped here. Its `@useSecurity` reaches the document
    // through the operation itself, not through a server, so a namespace
    // with no server says nothing about it. An operation that emits no
    // operation object is already reported as one without a channel.
    if (target.kind !== "Namespace") continue;
    if (hasServers(target)) continue;
    for (const record of records) stray.push({ namespace: target, record });
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
