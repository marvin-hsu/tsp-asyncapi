/**
 * The resolve half of the messages.
 *
 * It reads the `@message` state and everything that decorates a message,
 * assigns each message its `components.messages` key, decides which of two
 * models that claim one key wins, and settles how the headers and the payload
 * of each message are described.
 *
 * What it does not do is expand a schema. A payload node carries the model
 * and the set of fields that left it for the headers. Turning that into a
 * schema needs the whole type graph, and that is the lower half's work.
 */

import { Model, Program, getDoc, getFriendlyName, getSummary } from "@typespec/compiler";
import {
  MessageState,
  getContentType,
  getCorrelationId,
  getRawPayload,
  listMessages,
} from "../decorators/index.js";
import { reportDiagnostic } from "../lib.js";
import { present } from "../optional-fields.js";
import {
  MessageHeaderPlan,
  liftedOf,
  planMessageHeaders,
  reportIgnoredNestedHeaders,
  headerSourceOf,
} from "./messages/headers.js";
import { buildRawSchema } from "./messages/payload.js";
import { buildMessageExamples } from "./messages/examples.js";
import { buildTags } from "./tags.js";
import { resolveExtensions } from "./extensions.js";
import { buildExternalDocs } from "../external-docs.js";
import {
  declarationNameFor,
  fallbackDeclarationName,
  isSafeComponentsKey,
  sanitizeDeclarationName,
  unqualifiedDeclarationName,
} from "../naming.js";
import { BindingPlacements, markBindingsPlaced, resolveBindings } from "./bindings.js";
import { MessageHeadersNode, MessageNode, MessagePayloadNode } from "./service.js";
import type { SchemaArtifactIndex } from "../schema-artifacts.js";

/**
 * What the resolve half of the messages produces.
 *
 * `keys` names the key each surviving model claimed. A model a key collision
 * dropped is absent, so a channel that names such a model emits no entry for
 * it.
 *
 * `extensionCarriers` holds every model whose `@extension` applications
 * reached a Message Object. It is wider than `keys`: a dropped model reached
 * the message its key names through the model that claimed it.
 *
 * @internal
 */
export interface ResolvedMessages {
  readonly messages: readonly MessageNode[];
  readonly keys: Map<Model, string>;
  readonly extensionCarriers: ReadonlySet<Model>;
}

/**
 * Returns the `components.messages` key for one `@message` model.
 *
 * The decorator argument wins. Without it, the key is the model's own
 * declaration name, built the same way a `components.schemas` key is, minus
 * the namespace prefix. A template instantiation therefore builds its
 * argument names, so `Envelope<string>` and `Envelope<int32>` claim two
 * distinct keys instead of both claiming the bare template name.
 *
 * Dropping the namespace prefix is deliberate. Two same-named message models
 * in different namespaces collide, and the caller reports that collision.
 *
 * The chosen name goes through `sanitizeDeclarationName`, so a character
 * outside the AsyncAPI Components Object key charset never reaches the
 * output. Every rewrite of free-form user text is reported through
 * `sanitized-message-key`. Three routes reach one: an explicit decorator
 * argument, a backtick-quoted model name, and a `@friendlyName` outside the
 * charset. All three are text the user typed, and a topic-style name is
 * idiomatic in AsyncAPI, so emitting different text in silence would leave
 * the user with a key they never asked for.
 *
 * A plain TypeSpec identifier is already inside the charset, so an ordinary
 * model reports nothing. The derived segments of a template instantiation
 * report nothing either: the user did not write that text.
 */
function messageKeyFor(program: Program, model: Model, state: MessageState): string {
  if (state.name === undefined) {
    return derivedMessageKey(program, model);
  }
  if (state.name.length === 0) {
    // An empty key is not a legal member name. The user typed the empty
    // string on purpose, so the fallback must not be silent.
    const emitted = derivedMessageKey(program, model);
    reportDiagnostic(program, {
      code: "sanitized-message-key",
      target: model,
      format: { requested: state.name, emitted },
    });
    return emitted;
  }
  if (isSafeComponentsKey(state.name)) {
    return state.name;
  }
  const emitted = sanitizeDeclarationName(state.name);
  reportDiagnostic(program, {
    code: "sanitized-message-key",
    target: model,
    format: { requested: state.name, emitted },
  });
  return emitted;
}

/** The key of a message that carries no `@message` argument. */
function derivedMessageKey(program: Program, model: Model): string {
  const emitted = unqualifiedDeclarationName(program, model);
  const requested = getFriendlyName(program, model) ?? model.name;
  if (requested.length > 0 && !isSafeComponentsKey(requested)) {
    reportDiagnostic(program, {
      code: "sanitized-message-key",
      target: model,
      format: { requested, emitted },
    });
  }
  return emitted;
}

/**
 * The `components.schemas` key a model would claim, without claiming it.
 *
 * Whether a model earns a schema key at all is decided while the type graph
 * is walked, and that happens in the lower half. What the key would be is a
 * property of the model, so it can be computed here.
 */
function schemaKeyCandidate(program: Program, model: Model): string {
  return declarationNameFor(program, model) ?? fallbackDeclarationName(program, model);
}

/**
 * Tells whether two models are two instantiations of one template
 * declaration that also emit one and the same `components.schemas` entry.
 *
 * Such a pair is one declaration in the emitted document, however many
 * TypeSpec types back it. The compiler creates a separate instantiation per
 * template argument type, so two structurally identical arguments produce two
 * types that describe one shape. Reporting a key collision between them would
 * name a mistake the author cannot fix: no `@message` argument separates two
 * things the document cannot tell apart.
 */
function isSameDeclaration(program: Program, left: Model, right: Model): boolean {
  if (left.templateMapper === undefined || right.templateMapper === undefined) {
    return false;
  }
  if (left.node === undefined || left.node !== right.node) {
    return false;
  }
  return schemaKeyCandidate(program, left) === schemaKeyCandidate(program, right);
}

/**
 * Surfaces the diagnostics of a message the key collision dropped.
 *
 * The model never reaches the document, so nothing else reads its examples. A
 * bad value inside one would then go unreported purely because another model
 * won the key, which is not a reason to stay silent.
 *
 * The tags need no call of their own. `reportTagConflicts` walks every type
 * that carries the decorator, so a dropped model is covered there.
 */
function reportDroppedMessage(program: Program, model: Model): void {
  buildMessageExamples(program, model);
}

/** How the headers of one message are described. */
function resolveHeaders(plan: MessageHeaderPlan, model: Model): MessageHeadersNode {
  const source = headerSourceOf(plan, model);
  if (source === undefined) return { kind: "none" };
  if (source.raw !== undefined) return { kind: "raw", schema: buildRawSchema(source.raw) };
  if (source.model !== undefined) return { kind: "model", model: source.model };
  return { kind: "fields", fields: source.fields };
}

/**
 * How the payload of one message is described.
 *
 * A schema of another format wins over the TypeSpec type, whoever wrote it.
 * The author writes one with `@rawPayload`, and a preview feature generates
 * one for a model that carries the decorators of another schema language.
 * Both take the same raw node, so nothing after this point can tell them
 * apart, and both skip the schema the model would otherwise produce.
 *
 * An authored schema wins over a generated one. It is the explicit statement
 * of the two, and a generated schema that silently replaced it would leave
 * the author's own text out of the document with nothing to say so.
 *
 * The author is told which of the two the document carries. The generated
 * schema leaves the document, and a warning names the feature that produced
 * it, so the author can drop their own text or turn the feature off.
 */
function resolvePayload(
  program: Program,
  plan: MessageHeaderPlan,
  model: Model,
  artifacts: SchemaArtifactIndex,
): MessagePayloadNode {
  const authored = getRawPayload(program, model);
  const generated = artifacts.payloadFor.get(model);

  if (authored !== undefined) {
    if (generated !== undefined) {
      reportDiagnostic(program, {
        code: "conflicting-message-schema-source",
        target: model,
        format: { provider: generated.provider },
      });
    }
    return { kind: "raw", schema: buildRawSchema(authored) };
  }
  if (generated !== undefined) {
    return {
      kind: "raw",
      schema: { schemaFormat: generated.schemaFormat, schema: generated.schema },
    };
  }
  return { kind: "model", model, lifted: liftedOf(plan, model) };
}

/**
 * Resolves every model that `@message` marks.
 *
 * A key collision is a hard error, the same policy `components.schemas` uses.
 * No model is renamed. The first to claim the key keeps it, and the later one
 * is dropped and reported.
 *
 * The headers of every message are planned before any node is built. A field
 * that leaves the payload for the headers changes the payload's shape, a
 * payload schema is built once and then cached, and one message model can be
 * reached through another message's payload. So the plan cannot be made one
 * message at a time. Resolving the whole program before the lower half runs
 * gives that ordering for free.
 *
 * A template declaration never reaches this loop. The compiler runs a
 * decorator only on an instantiation, so `@message model Envelope<T>`
 * contributes one message per instantiation and none for the declaration.
 *
 * @param program - The program to read the messages from
 * @param placements - Where the binding applications this build placed are
 * recorded
 * @param artifacts - The schemas another tool generated for this program
 * @returns The messages in source order, the key each surviving model
 * claimed, and every model whose extensions reached a Message Object
 * @internal
 */
export function resolveMessages(
  program: Program,
  placements: BindingPlacements,
  artifacts: SchemaArtifactIndex,
): ResolvedMessages {
  const declared = listMessages(program);
  const models = [...declared.keys()];
  const plan = planMessageHeaders(program, models);
  reportIgnoredNestedHeaders(program, models, plan.topLevel);

  const messages: MessageNode[] = [];
  const keys = new Map<Model, string>();
  const claimedBy = new Map<string, Model>();
  // Every model this loop sees reached the message its key names, whether it
  // claimed the key itself or the model that claimed it stood in for it. The
  // extension report reads this set, so a dropped model raises no warning
  // about a key the document does carry.
  const extensionCarriers = new Set<Model>();

  for (const [model, state] of declared) {
    extensionCarriers.add(model);
    const key = messageKeyFor(program, model, state);
    const owner = claimedBy.get(key);
    if (owner !== undefined) {
      // Both branches below leave the loop without a node, so both account
      // for this model's bindings here. The model reached the message the key
      // names, through the model that claimed it. Two instantiations of one
      // template are the case with no report of its own, and leaving the
      // marking to the reporting branch made every second instantiation warn
      // that its binding reaches nothing.
      markBindingsPlaced(program, "message", model, placements);
      if (!isSameDeclaration(program, owner, model)) {
        reportDiagnostic(program, {
          code: "duplicate-message-key",
          target: model,
          format: { name: key },
        });
        reportDroppedMessage(program, model);
      }
      continue;
    }
    claimedBy.set(key, model);
    keys.set(model, key);
    messages.push({
      target: model,
      key,
      ...textField("title", getSummary(program, model)),
      ...textField("description", getDoc(program, model)),
      ...textField("contentType", getContentType(program, model)),
      headers: resolveHeaders(plan, model),
      payload: resolvePayload(program, plan, model, artifacts),
      ...present("correlationId", getCorrelationId(program, model)),
      examples: buildMessageExamples(program, model) ?? [],
      tags: buildTags(program, model) ?? [],
      ...present("externalDocs", buildExternalDocs(program, model)),
      bindings: resolveBindings(program, "message", model, placements),
      extensions: resolveExtensions(program, model),
    });
  }

  return { messages, keys, extensionCarriers };
}

/** Includes a text field only when it holds one. */
function textField<K extends string>(
  name: K,
  value: string | undefined,
): Record<K, string> | Record<string, never> {
  return value !== undefined && value.length > 0 ? ({ [name]: value } as Record<K, string>) : {};
}
