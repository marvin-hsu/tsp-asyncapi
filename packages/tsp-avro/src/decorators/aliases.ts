import { DecoratorContext, Enum, Model, ModelProperty, Program, Scalar } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../lib.js";
import { isAvroName, isAvroNamespace } from "./names.js";

const aliasesStateKey = Symbol.for("tsp-avro.aliases");

const [getAliasesInternal, setAliasesInternal] = useStateMap<
  Model | ModelProperty | Enum | Scalar,
  readonly string[]
>(aliasesStateKey);

/**
 * Declares the names a reader also knows this declaration by.
 *
 * An Avro reader uses aliases to read data written under an older schema. A
 * record, an enum and a fixed type take a full name, which is a namespace and
 * a name joined by dots. A field takes a plain name, because a field carries
 * no namespace of its own.
 *
 * A name that breaks the Avro rules is reported here, where the author wrote
 * it, and nothing is recorded.
 *
 * @param context - The decorator context
 * @param target - The record, enum or field the names belong to
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
  target: Model | ModelProperty | Enum,
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

  setAliasesInternal(context.program, target, names);
}

/**
 * Reads the aliases declared on a declaration.
 *
 * A scalar is accepted because `@fixed` turns one into a named Avro type, and
 * the walk reads the aliases of every named type through one call. No scalar
 * carries any, because `@aliases` does not target one.
 *
 * @param program - The program to read the state from
 * @param target - The declaration to read
 * @returns The names, or undefined when the declaration carries none
 *
 * @public
 */
export function getAvroAliases(
  program: Program,
  target: Model | ModelProperty | Enum | Scalar,
): readonly string[] | undefined {
  return getAliasesInternal(program, target);
}
