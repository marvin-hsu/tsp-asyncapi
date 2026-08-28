/**
 * The resolve half of tag metadata (`@tag` and `@asyncTag`).
 *
 * It reads both decorators on one type, merges them into one Tag Object per
 * name, and reports every conflict between two `@asyncTag` applications of
 * the same name.
 *
 * What it produces is the `tags` array of one object, in source order. The
 * lower half emits that array as-is and does no merging itself.
 */

import { DiagnosticTarget, Program, Type, getTags } from "@typespec/compiler";
import type { TagObject } from "../types/index.js";
import { AsyncTagExternalDocs, AsyncTagState, getAsyncTags } from "../decorators/index.js";
import { listAsyncTagTargets } from "../decorators/document/async-tag.js";
import { reportDiagnostic } from "../lib.js";
import { bySourcePosition, orderBySourceNodes, sourcePositionOf } from "../source-order.js";
import { text } from "../optional-fields.js";

/** One `@asyncTag` field two applications of one name disagree about. */
interface TagClash {
  readonly name: string;
  readonly field: string;
  readonly node: DiagnosticTarget;
}

/** The merge of one type's tags, and every disagreement inside it. */
interface MergedTags {
  readonly merged: Map<string, AsyncTagState>;
  readonly clashes: readonly TagClash[];
}

/**
 * Reports every `@asyncTag` metadata conflict, once per type.
 *
 * The merge itself is silent, and this is the only place that reports. A
 * service namespace can be read again for its servers, and again when it
 * carries a channel; reporting here instead of at the merge keeps one
 * disagreement from being reported once per caller.
 *
 * Every type that carries the decorator is walked, not only the ones that
 * reached the document. A type whose declaration was dropped still holds a
 * mistake worth reporting.
 *
 * The reports come out in source order, restored here because the state
 * layer hands types over in decorator-run order, not the order the author
 * reads.
 *
 * @param program - The program to read the state from
 * @internal
 */
export function reportTagConflicts(program: Program): void {
  const compare = bySourcePosition(program);
  const targets = listAsyncTagTargets(program)
    .map(([target]) => ({ target, key: sourcePositionOf(target) }))
    .sort((a, b) => compare(a.key, b.key));

  for (const { target } of targets) {
    for (const clash of mergeAsyncTags(program, target).clashes) {
      reportDiagnostic(program, {
        code: "conflicting-tag-metadata",
        target: clash.node,
        format: { name: clash.name, field: clash.field },
      });
    }
  }
}

/**
 * Builds the `tags` array of one object, or returns `undefined` when the
 * type carries no tag.
 *
 * Two decorators feed this array. The built-in `@tag` carries a name and
 * nothing else. This library's `@asyncTag` carries a name plus the metadata
 * an AsyncAPI Tag Object holds. A name both decorators declare on one type
 * produces one Tag Object, not two: AsyncAPI names each tag once per object,
 * and `@tag` carries nothing that could disagree with the metadata.
 *
 * The built-in tags come first, in the order the compiler records them. Each
 * remaining `@asyncTag` name follows, in source order. A name appears once,
 * since AsyncAPI requires the names in one `tags` array to be unique.
 */
export function buildTags(program: Program, target: Type): TagObject[] | undefined {
  const merged = mergeAsyncTags(program, target).merged;
  const names: string[] = [];
  for (const name of getTags(program, target)) {
    if (!names.includes(name)) {
      names.push(name);
    }
  }
  for (const name of merged.keys()) {
    if (!names.includes(name)) {
      names.push(name);
    }
  }
  if (names.length === 0) {
    return undefined;
  }
  return names.map((name) => toTagObject(name, merged.get(name)));
}

/**
 * Builds one Tag Object.
 * A field the tag does not declare is left out. An empty string would claim
 * the tag has a blank description rather than none.
 */
function toTagObject(name: string, metadata: AsyncTagState | undefined): TagObject {
  return {
    name,
    ...text("description", metadata?.description),
    ...(metadata?.externalDocs !== undefined
      ? {
          externalDocs: {
            url: metadata.externalDocs.url,
            ...text("description", metadata.externalDocs.description),
          },
        }
      : {}),
  };
}

/**
 * Merges every `@asyncTag` on one type into one entry per tag name, and
 * reports each conflict between two of them.
 *
 * The applications are put back in source order first, since order decides
 * the outcome of a merge and has to match what the reader sees, not the
 * bottom-up order the decorators ran in.
 *
 * Two applications of one name merge field by field: a field only one of
 * them sets is taken from that one, the same rule the built-in `@tag` merge
 * follows. A field set to two different values is a conflict. AsyncAPI
 * emits one Tag Object per name, so one value would have to be dropped; the
 * emitter reports the conflict instead of choosing, and keeps the first
 * application's field so the rest of the document stays readable.
 *
 * A tag of the same name on a *different* type is not a conflict. AsyncAPI
 * gives every object its own `tags` array, and those arrays are independent.
 */
function mergeAsyncTags(program: Program, target: Type): MergedTags {
  const clashes: TagClash[] = [];
  const recorded = getAsyncTags(program, target);
  const merged = new Map<string, AsyncTagState>();
  const ordered = orderBySourceNodes(
    program,
    recorded.map((tag) => tag.node),
    recorded,
  );

  for (const tag of ordered) {
    const kept = merged.get(tag.name);
    if (kept === undefined) {
      merged.set(tag.name, tag);
      continue;
    }
    const conflicts = conflictingFields(kept, tag);
    for (const field of conflicts) {
      clashes.push({ name: tag.name, field, node: tag.node });
    }
    // The merge runs even after a conflict. Only the conflicting field falls
    // back to the first application. A field the later application alone
    // contributes is still taken from it, because nothing disagrees about it.
    merged.set(tag.name, {
      ...kept,
      ...(!conflicts.includes("description") &&
      kept.description === undefined &&
      tag.description !== undefined
        ? { description: tag.description }
        : {}),
      ...(!conflicts.includes("externalDocs") && tag.externalDocs !== undefined
        ? { externalDocs: mergeExternalDocs(kept.externalDocs, tag.externalDocs) }
        : {}),
    });
  }
  return { merged, clashes };
}

/**
 * Merges two agreeing `externalDocs` values into one.
 * The caller has already established that they agree, so the two `url` values
 * are the same. A `description` that only one of them carries is taken from
 * that one, the same rule the tag's own fields follow.
 */
function mergeExternalDocs(
  kept: AsyncTagExternalDocs | undefined,
  added: AsyncTagExternalDocs,
): AsyncTagExternalDocs {
  if (kept === undefined) {
    return added;
  }
  const description = kept.description ?? added.description;
  return {
    url: kept.url,
    ...text("description", description),
  };
}

/**
 * Names every field that two applications of one tag name disagree about.
 * A field only one of the two sets is not a disagreement, and each
 * disagreeing field is named on its own, so the caller can keep the first
 * value of that field and still merge the rest.
 *
 * The fields of `externalDocs` are compared the same way. Two different
 * `url` values disagree, since a Tag Object holds one link, and so do two
 * different descriptions of that link. A description only one side carries
 * merges into the other's `url` instead.
 */
function conflictingFields(kept: AsyncTagState, added: AsyncTagState): string[] {
  const fields: string[] = [];
  if (
    kept.description !== undefined &&
    added.description !== undefined &&
    kept.description !== added.description
  ) {
    fields.push("description");
  }
  if (
    kept.externalDocs !== undefined &&
    added.externalDocs !== undefined &&
    (kept.externalDocs.url !== added.externalDocs.url ||
      (kept.externalDocs.description !== undefined &&
        added.externalDocs.description !== undefined &&
        kept.externalDocs.description !== added.externalDocs.description))
  ) {
    fields.push("externalDocs");
  }
  return fields;
}
