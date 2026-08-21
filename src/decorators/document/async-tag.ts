import { DecoratorContext, Program, Type } from "@typespec/compiler";
import { AugmentDecoratorStatementNode, DecoratorExpressionNode } from "@typespec/compiler/ast";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../../lib.js";

const asyncTagStateKey = Symbol.for("tsp-asyncapi.asyncTag");

/**
 * A link to documentation held outside this document.
 * It is the `externalDocs` argument of `@asyncTag`.
 * @public
 */
export interface AsyncTagExternalDocs {
  /** The URL of the documentation. */
  url: string;
  /** A short description of what the documentation covers. */
  description?: string;
}

/**
 * The metadata argument of `@asyncTag`.
 * The field names come from the AsyncAPI Tag Object. The name of the tag is
 * not here. It is a separate argument of the decorator.
 * @public
 */
export interface AsyncTagMetadata {
  /** A short description of the tag. */
  description?: string;
  /** A link to more documentation about the tag. */
  externalDocs?: AsyncTagExternalDocs;
}

/**
 * One tag recorded by `@asyncTag`.
 * It is the element type of the array `getAsyncTags` returns, so it is part
 * of the public surface.
 * @public
 */
export interface AsyncTagState extends AsyncTagMetadata {
  /** The name of the tag. */
  name: string;
  /**
   * The source node of this application.
   * The recorded list is in the order the applications ran, and that is not
   * source order. The node carries the position the emitter sorts by. The
   * emitter also reports a conflict against this node, so the message points
   * at the application that declared the conflicting value.
   */
  node: DecoratorExpressionNode | AugmentDecoratorStatementNode;
}

const [getAsyncTagsInternal, setAsyncTags, getAsyncTagStateMap] = useStateMap<
  Type,
  AsyncTagState[]
>(asyncTagStateKey);

/**
 * Adds one tag, with its metadata, to the emitted object.
 *
 * This decorator exists because the built-in `@tag` cannot express an
 * AsyncAPI Tag Object. The built-in decorator takes a name and nothing else,
 * and its target does not include `Model`. AsyncAPI puts a full Tag Object on
 * each item, and a message is a model. So a message can only be tagged
 * through this decorator.
 *
 * It is named `asyncTag` and not `tag`. The built-in `@tag` lives in the
 * global `TypeSpec` namespace, which is always in scope. A second `tag` in
 * this namespace would make a plain `@tag(...)` ambiguous for anyone who
 * writes `using AsyncAPI;`, and every existing `@tag` would have to be
 * rewritten as `@TypeSpec.tag(...)`.
 *
 * This decorator is repeatable. Each application adds one tag rather than
 * replacing a prior one. The emitted `tags` array follows source order.
 *
 * The built-in `@tag` keeps working wherever it already works. The two merge
 * into one Tag Object when they name the same tag on one target, and the
 * metadata given here wins.
 *
 * The name must not be empty. AsyncAPI requires a Tag Object to carry a
 * `name`, and a blank one names nothing a consumer can match. An empty name
 * is reported and the tag is dropped.
 *
 * @param context - The decorator context
 * @param target - The type to tag
 * @param name - The name of the tag
 * @param metadata - The `description` and `externalDocs` of the tag
 *
 * @example
 * ```typespec
 * @message
 * @asyncTag("orders", #{ description: "Everything about orders." })
 * model OrderCreated {
 *   id: string;
 * }
 * ```
 *
 * @public
 */
export function $asyncTag(
  context: DecoratorContext,
  target: Type,
  name: string,
  metadata?: AsyncTagMetadata,
) {
  // `decoratorTarget` is the source node of the application that is running.
  // Its static type is the wider `DiagnosticTarget`, so it is narrowed here
  // to the node kinds a decorator application can have.
  const node = context.decoratorTarget as DecoratorExpressionNode | AugmentDecoratorStatementNode;
  if (name.length === 0) {
    reportDiagnostic(context.program, { code: "empty-tag-name", target: node });
    return;
  }
  const tags = getAsyncTagsInternal(context.program, target) ?? [];
  // An empty prose field is dropped here rather than recorded. A blank
  // description claims the tag has an empty description rather than none.
  // Dropping it at the entry keeps the merge and the emitted document free of
  // empty strings. The `name` is the one field that cannot be dropped, so it
  // is reported above instead.
  tags.push({
    node,
    name,
    ...(metadata?.description ? { description: metadata.description } : {}),
    ...(metadata?.externalDocs !== undefined
      ? { externalDocs: toExternalDocs(metadata.externalDocs) }
      : {}),
  });
  setAsyncTags(context.program, target, tags);
}

/** Records one `externalDocs` value, without an empty description. */
function toExternalDocs(externalDocs: AsyncTagExternalDocs): AsyncTagExternalDocs {
  return {
    url: externalDocs.url,
    ...(externalDocs.description ? { description: externalDocs.description } : {}),
  };
}

/**
 * Reads back every tag that `@asyncTag` records for one type.
 * The list is in the order the applications ran, which is not source order.
 * The emitter sorts it before it emits the `tags` array.
 *
 * Same-named applications are not merged here, and a conflict between them is
 * not reported here. The emitter does both, because only the emitter knows
 * source order, and source order decides which value a merge keeps.
 *
 * @param program - The program to read the state from
 * @param target - The type the decorator was applied to
 * @returns The recorded tags. The array is empty when the decorator was never
 * applied.
 *
 * @public
 */
export function getAsyncTags(program: Program, target: Type): AsyncTagState[] {
  return getAsyncTagsInternal(program, target) ?? [];
}

/**
 * Lists every type that carries `@asyncTag`, with its recorded tags.
 *
 * The tag conflicts are reported once per type, in the resolve wrap-up. That
 * needs the whole set, because a type that reaches no document object still
 * carries a mistake worth reporting.
 *
 * The order is the order the decorators ran, which is not the order the
 * author reads. The caller sorts.
 *
 * @param program - The program to read the state from
 * @returns Each type and the tags recorded on it
 * @internal
 */
export function listAsyncTagTargets(program: Program): [Type, readonly AsyncTagState[]][] {
  return [...getAsyncTagStateMap(program)];
}
