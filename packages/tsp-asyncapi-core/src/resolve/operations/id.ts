import { Interface, Operation } from "@typespec/compiler";
import { INHERITED_OPERATION_ID_SEPARATOR } from "../../constants.js";
import { OperationActionState } from "../../decorators/operations/state.js";

/**
 * The key one operation takes in the root `operations` map.
 *
 * The explicit id given to `@send` or `@receive` always wins. The author
 * named the key, so nothing here qualifies it.
 *
 * Without one, the declaration name is the key. That name is unique inside
 * the interface or namespace that declares the operation, and the emitter
 * reports the rest as a duplicate.
 *
 * An inherited operation is the exception. `interface C extends Base` copies
 * every operation of `Base` into `C`, and two interfaces that extend one base
 * hold two copies of one declaration under one name. The name alone therefore
 * cannot be a key. The interface that inherited the operation supplies the
 * missing part, which is what `@typespec/openapi3` does for every operation
 * with its default `parent-container` strategy.
 *
 * @param operation - The operation to key
 * @param record - The state the action decorator recorded for it
 * @returns The key this operation claims
 */
export function operationId(operation: Operation, record: OperationActionState): string {
  if (record.operationId !== undefined) return record.operationId;
  const inheritedBy = inheritingInterface(operation);
  if (inheritedBy === undefined) return operation.name;
  return `${inheritedBy.name}${INHERITED_OPERATION_ID_SEPARATOR}${operation.name}`;
}

/**
 * Names the interface that inherited one operation, and `undefined` when the
 * operation was declared where it sits.
 *
 * The compiler copies an inherited operation rather than linking it, and the
 * copy keeps the syntax node of the declaration it was copied from. So the
 * node of an inherited operation sits under another interface, and the node
 * of a declared one sits under its own. This holds through a chain of
 * `extends`, because each copy keeps the node of the original declaration.
 *
 * `op f is Base.g` is a declaration, not a copy. It writes its own node
 * inside its own interface, so it keeps its own name as its key.
 *
 * The copy carries no other link back. `sourceOperation` stays `undefined`,
 * because the compiler sets that field for `is` alone.
 */
function inheritingInterface(operation: Operation): Interface | undefined {
  const owner = operation.interface;
  if (owner === undefined) return undefined;
  if (operation.node === undefined) return undefined;
  return operation.node.parent === owner.node ? undefined : owner;
}
