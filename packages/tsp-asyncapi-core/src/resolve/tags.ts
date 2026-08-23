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
 * The merge itself is silent, and this is the only place that reports. The
 * two were one function before, which meant the report came out once per
 * caller rather than once per mistake: a service namespace is read again for
 * its servers, and again when it carries a channel, so one disagreement was
 * reported two or three times depending on which other roles that namespace
 * happened to play.
 *
 * Every type that carries the decorator is walked, not only the ones that
 * reached the document. A type whose declaration was dropped still holds a
 * mistake worth reporting, and this is what keeps that report alive without
 * the dropping site having to ask for it.
 *
 * The reports come out in source order. The state layer hands the types over
 * in the order the decorators ran, which is not the order the author reads.
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
 * an AsyncAPI Tag Object holds.
 *
 * A name that both decorators declare on one type produces one Tag Object,
 * not two. AsyncAPI names each tag once per object, and the built-in `@tag`
 * carries nothing that could disagree with the metadata. So the merge is the
 * two decorators stating one fact together, not an ambiguity to report.
 *
 * The built-in tags come first, in the order the compiler records them. Each
 * remaining `@asyncTag` name follows, in source order.
 *
 * A name appears once. AsyncAPI requires the names in one `tags` array to be
 * unique, so a name repeated by two applications still emits one entry. Two
 * applications of the built-in `@tag` with one name therefore emit one entry
 * as well, where earlier versions of this emitter emitted two.
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
 * The applications are put back in source order first. Order decides the
 * outcome of a merge, so it has to be the order the reader sees, not the
 * bottom-up order the decorators ran in.
 *
 * Two applications of one name merge field by field. A field only one of them
 * sets is taken from that one. This is the same rule the built-in `@tag`
 * merge follows: an application that says nothing about a field cannot
 * disagree about it. So `@asyncTag("orders")` next to
 * `@asyncTag("orders", #{ description: "..." })` keeps the description,
 * exactly as `@tag("orders")` next to the same `@asyncTag` would.
 *
 * A field that two applications set to two different values is a conflict.
 * AsyncAPI emits one Tag Object per name, so one of the two values would have
 * to be dropped. The emitter reports the conflict instead of choosing. The
 * first application in source order keeps the field, so the rest of the
 * document stays readable while the error is unresolved.
 *
 * A tag of the same name on a *different* type is not a conflict and is not
 * reported. AsyncAPI gives every object its own `tags` array, and those
 * arrays are independent.
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
 * The list is empty when they agree about every field.
 * A field that only one of the two sets is not a disagreement.
 * Each field is named on its own, so the caller can keep the first value of
 * that one field and still merge the rest.
 * The fields of `externalDocs` are compared one by one, the same way the tag's
 * own fields are. Two different `url` values disagree, because a Tag Object
 * holds one link. Two different descriptions of that one link disagree as
 * well. A description that only one of the two carries is not a disagreement,
 * so an application that adds a description to a url another one already
 * named merges into it.
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
