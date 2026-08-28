/**
 * The `@aliases` decorator and its reader, `getAvroAliases`.
 *
 * This file only validates a name against the Avro grammar and records the
 * result. It does not decide which declarations need an alias. It does not
 * build the `"aliases"` member either. The walk reads this state later and
 * makes both calls.
 */

import { DecoratorContext, Enum, Model, ModelProperty, Program, Scalar } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../lib.js";
import { isAvroName, isAvroNamespace } from "./names.js";

const aliasesStateKey = Symbol.for("tsp-avro.aliases");

/**
 * What an alias can be written on.
 *
 * Avro gives a name to a record, an enum, a fixed type and a field, and an
 * alias is a name a reader also knows the declaration by. A scalar is here
 * because `@fixed` makes a named Avro type of one.
 *
 * @public
 */
export type AvroAliasTarget = Model | ModelProperty | Enum | Scalar;

const [getAliasesInternal, setAliasesInternal] = useStateMap<AvroAliasTarget, readonly string[]>(
  aliasesStateKey,
);

/**
 * Declares the names a reader also knows this declaration by.
 *
 * An Avro reader uses aliases to read data written under an older schema. A
 * record, an enum and a fixed type take a full name, a namespace and a name
 * joined by dots. A field takes a plain name, since a field has no namespace
 * of its own. A scalar takes one where `@fixed` makes it a named Avro type;
 * a primitive scalar has no name of its own, so an alias there is refused by
 * the walk.
 *
 * A name that breaks the Avro rules is reported here, where the author wrote
 * it, and nothing is recorded.
 *
 * @param names - The alternate names, in the order Avro writes them
 *
 * @example
 * ```typespec
 * @aliases("com.example.old.OrderPlaced")
 * @record
 * model OrderPlaced {
 *   @aliases("orderId") id: string;
 * }
 * ```
 *
 * @public
 */
export function $aliases(
  context: DecoratorContext,
  target: AvroAliasTarget,
  ...names: string[]
): void {
  // A full name has the grammar of a namespace: one or more Avro names joined
  // by dots. An unqualified alias on a named type is legal too, and it reads
  // as one name with no dot in it, which that grammar already allows.
  const accepts = target.kind === "ModelProperty" ? isAvroName : isAvroNamespace;

  const refused = names.filter((name) => !accepts(name));
  for (const name of refused) {
    reportDiagnostic(context.program, {
      code: "invalid-name",
      messageId: target.kind === "ModelProperty" ? "default" : "alias",
      format: { name },
      target: context.decoratorTarget,
    });
  }
  if (refused.length > 0) {
    return;
  }

  // An empty list is nothing to record. A reader does nothing with it, and
  // writing `"aliases": []` puts a member in the file that says as much as
  // leaving it out.
  if (names.length === 0) {
    return;
  }

  setAliasesInternal(context.program, target, names);
}

/**
 * Reads the aliases declared on a declaration.
 *
 * A scalar carries aliases where `@fixed` turns one into a named Avro type.
 * The walk reads the aliases of every named type through this one call.
 *
 * @returns The names, or undefined when the declaration carries none
 *
 * @public
 */
export function getAvroAliases(
  program: Program,
  target: AvroAliasTarget,
): readonly string[] | undefined {
  return getAliasesInternal(program, target);
}
