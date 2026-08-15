import {
  getDoc,
  getFriendlyName,
  getSummary,
  Model,
  ModelProperty,
  Program,
} from "@typespec/compiler";
import { MessageObject } from "../types/index.js";
import { reportDiagnostic } from "../lib.js";
import {
  getContentType,
  getCorrelationId,
  listMessages,
  MessageState,
} from "../decorators/index.js";
import { SchemaBuilder } from "./schemas/builder.js";
import {
  buildMessageHeaders,
  MessageHeaderPlan,
  planMessageHeaders,
  reportIgnoredNestedHeaders,
} from "./message-headers.js";
import { buildMessageExamples } from "./message-examples.js";
import { buildTags } from "./tags.js";
import { buildExternalDocs } from "./external-docs.js";
import {
  isSafeComponentsKey,
  sanitizeDeclarationName,
  unqualifiedDeclarationName,
} from "./schemas/schema-naming.js";

/**
 * Returns the `components.messages` key for one `@message` model.
 * The decorator argument wins. Without it, the key is the model's own
 * declaration name, built the same way a `components.schemas` key is, minus
 * the namespace prefix. A template instantiation therefore composes its
 * argument names, so `Envelope<string>` and `Envelope<int32>` claim two
 * distinct keys instead of both claiming the bare template name.
 * Dropping the namespace prefix is deliberate. Two same-named message models
 * in different namespaces collide, and the caller reports that collision.
 * The chosen name goes through `sanitizeDeclarationName`, so a character
 * outside the AsyncAPI Components Object key charset never reaches the
 * output.
 * Every rewrite of free-form user text is reported through
 * `sanitized-message-key`. Three routes reach one: an explicit decorator
 * argument such as `order/created`, a backtick-quoted model name such as
 * `` model `order/created` ``, and a `@friendlyName` outside the charset.
 * All three are text the user typed, and a topic-style name is idiomatic in
 * AsyncAPI. So silently emitting different text would leave the user with a
 * key they never asked for.
 * A plain TypeSpec identifier is already inside the charset, so an ordinary
 * model reports nothing. The composed segments of a template instantiation
 * report nothing either. The user did not write that text; the emitter
 * composed it.
 * An empty decorator argument falls back to the model name, and it is
 * reported too. An empty key is not a legal member name. The user typed the
 * empty string on purpose, so the fallback must not be silent.
 */
function messageKeyFor(program: Program, model: Model, state: MessageState): string {
  if (state.name === undefined) {
    return derivedMessageKey(program, model);
  }
  if (state.name.length === 0) {
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

/**
 * Builds the message key from the model's own declaration, and reports the
 * rewrite when that declaration name is free-form text outside the key
 * charset.
 * The source text is the `@friendlyName` when the model has one, because
 * that name wins outright over the declaration name. Otherwise it is the
 * model's own name.
 */
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
 * The fields this message lifted out of its own payload.
 *
 * The plan records a header source per message, so the answer is local to
 * one message rather than shared across every message that reaches the same
 * model. A message that lifts nothing gets an empty set, and its payload
 * stays a reference to the model's own component.
 */
function liftedOf(plan: MessageHeaderPlan, model: Model): ReadonlySet<ModelProperty> {
  const source = plan.sources.get(model);
  if (source === undefined || source.model !== undefined) return new Set();
  return new Set(source.fields);
}

/**
 * Builds one Message Object.
 *
 * The payload is always a `$ref` to the model's `components.schemas` entry.
 * A `@message` target is a top-level declaration, so it is never inlined.
 * `buildDeclarationRef` is what enforces that; plain `buildSchema` would
 * inline a declaration with no compact composed name, and the same body
 * could then be emitted both inside the message and as a component.
 * The key is taken from the builder rather than recomputed here, so
 * namespace qualification, `@friendlyName`, and sanitization stay in one
 * place.
 *
 * The descriptive fields follow the mapping the schema layer already uses:
 * `@summary` becomes `title` and `@doc` becomes `description`. AsyncAPI
 * also defines `summary`, but TypeSpec has no third source to fill it from,
 * so it is left out rather than filled with a copy of another field.
 *
 * `name` carries the `components.messages` key. The key is already the
 * property name in the map, so this repeats it; the field exists because a
 * reader that follows a `$ref` to a message sees the object alone, without
 * the key it was stored under.
 *
 * A field with nothing to say is left out. An empty string would claim the
 * message has a blank title rather than none.
 *
 * `headers` comes from the plan the caller resolved before any schema was
 * built. See `planMessageHeaders`. The payload is built after it, so the
 * payload schema no longer describes the fields the headers took.
 *
 * `correlationId` and `examples` are emitted as the user wrote them. Neither
 * is checked against the payload or the headers schema. AsyncAPI states no
 * such requirement, and its own examples point a correlation id at a path no
 * schema declares.
 *
 * `tags` comes from `@asyncTag`. The built-in `@tag` cannot reach a message,
 * because its target does not include `Model`. `externalDocs` comes from this
 * library's `@externalDocs`, the same decorator that fills `info.externalDocs`.
 */
function buildMessage(
  program: Program,
  schemas: SchemaBuilder,
  headerPlan: MessageHeaderPlan,
  model: Model,
  key: string,
): MessageObject {
  const title = getSummary(program, model);
  const description = getDoc(program, model);
  const contentType = getContentType(program, model);
  const headers = buildMessageHeaders(schemas, headerPlan, model);
  const correlationId = getCorrelationId(program, model);
  const examples = buildMessageExamples(program, model);
  const tags = buildTags(program, model);
  const externalDocs = buildExternalDocs(program, model);

  return {
    name: key,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(contentType ? { contentType } : {}),
    ...(headers ? { headers } : {}),
    payload: schemas.buildPayloadDeclaration(model, liftedOf(headerPlan, model)),
    ...(correlationId ? { correlationId } : {}),
    ...(tags ? { tags } : {}),
    ...(externalDocs ? { externalDocs } : {}),
    ...(examples ? { examples } : {}),
  };
}

/**
 * Builds the `components.messages` map from every model that `@message`
 * marks.
 * This function also drives schema collection. `SchemaBuilder.buildSchema`
 * collects the referenced models recursively. So `schemas` ends up holding
 * exactly the models each message payload reaches, and nothing else. A
 * model that no message reaches gets no `components.schemas` entry.
 * Returns `undefined` when the program declares no message. An empty map is
 * never emitted.
 *
 * A key collision is a hard error, the same policy `components.schemas`
 * uses for `duplicate-schema-key`. This function does not rename on
 * collision. The first model to claim the key keeps it. The later model is
 * skipped.
 * One collision is not an error: two models that would also claim one
 * `components.schemas` key. They emit a single component, so the surviving
 * message still describes both, and no `@message` argument can separate
 * them. See `isSameDeclaration`.
 *
 * A template *declaration* never reaches this loop. The compiler runs a
 * decorator only on an instantiation, so `@message model Envelope<T>`
 * contributes one message per instantiation and none for the declaration
 * itself.
 */
export function buildMessages(
  program: Program,
  schemas: SchemaBuilder,
): Record<string, MessageObject> | undefined {
  // A null prototype keeps a key such as `__proto__` an ordinary own
  // property. A plain object literal would run the inherited setter instead,
  // dropping the message and replacing the map's prototype. This matches
  // `SchemaBuilder.getSchemas`.
  const messages = Object.create(null) as Record<string, MessageObject>;
  const claimedBy = new Map<string, Model>();

  // The headers are resolved before the loop, and before any schema exists.
  // A payload schema is built once and then cached, and a message model can
  // be reached through another message's payload. So the fields that leave
  // the payload have to be known before the first build, not when the
  // message that owns them comes up in the loop.
  const messageModels = [...listMessages(program).keys()];
  const headerPlan = planMessageHeaders(program, messageModels);
  reportIgnoredNestedHeaders(program, messageModels, headerPlan.topLevel);

  for (const [model, state] of listMessages(program)) {
    const key = messageKeyFor(program, model, state);
    const owner = claimedBy.get(key);
    if (owner !== undefined) {
      if (!isSameDeclaration(schemas, owner, model)) {
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
    messages[key] = buildMessage(program, schemas, headerPlan, model, key);
  }

  // The schema keys must all be claimed before the shadow check reads them.
  // A discriminated subtype claims its key only when the pending queue is
  // drained, and that happens after this function returns. A message key
  // shadowing such a subtype would otherwise go unreported.
  schemas.flushPendingSubtypes();
  reportShadowedSchemaKeys(program, schemas, claimedBy);
  return Object.keys(messages).length > 0 ? messages : undefined;
}

/**
 * Reports the diagnostics of a message that a key collision drops.
 *
 * The Message Object of such a model is never built, so the builders that
 * report while they build never run on it. Their diagnostics describe
 * mistakes inside that model, and those mistakes stay after the collision is
 * fixed. Reporting them now hands the user every error at once, the same way
 * `planMessageHeaders` reports the header diagnostics of every message before
 * any key is claimed.
 *
 * The results are discarded. Only the reporting matters here.
 *
 * Two instantiations of one template that share a key are not dropped this
 * way. The surviving instantiation reports the same decorator applications,
 * so this function would report each of them twice.
 */
function reportDroppedMessage(program: Program, model: Model): void {
  buildTags(program, model);
  buildMessageExamples(program, model);
}

/**
 * Tells whether two models are two instantiations of one template
 * declaration that also emit one and the same `components.schemas` entry.
 * Such a pair is one declaration in the emitted document, however many
 * TypeSpec types back it. The compiler creates a separate instantiation per
 * template argument type, so two arguments that are structurally identical
 * but written twice, such as the two `Env<{ x: string }>` in one file, are
 * two types with one shared key. A message-key collision between them is not
 * a mistake the user made. There is only one `@message` in the source, so no
 * explicit name can separate the two, and the surviving message already refs
 * the component both would produce. So the caller keeps the first one and
 * reports nothing.
 *
 * Every other pair is two real declarations competing for one message name,
 * which is the collision `duplicate-message-key` exists to report.
 *
 * Both halves of the test are needed. A shared schema key alone does not
 * make two models one declaration: `@friendlyName` names a key outright, so
 * two unrelated models can carry the same one. Treating that as a single
 * declaration dropped the second message and its schema while reporting
 * nothing at all. `node` identity alone is not enough either, since two
 * instantiations of one template can still resolve to different keys.
 *
 * The key is only computed, never claimed. Asking here must not register a
 * component for a model whose message is about to be dropped.
 */
function isSameDeclaration(schemas: SchemaBuilder, left: Model, right: Model): boolean {
  if (left.templateMapper === undefined || right.templateMapper === undefined) {
    return false;
  }
  if (left.node === undefined || left.node !== right.node) {
    return false;
  }
  return schemas.schemaKeyCandidate(left) === schemas.schemaKeyCandidate(right);
}

/**
 * Reports every `components.messages` key that is also the
 * `components.schemas` key of a *different* type.
 * A message key drops the namespace prefix a schema key keeps. So
 * `@message("Sales.Ev")` on an unrelated model, or a `@message model Ev`
 * inside `namespace Sales` next to a global `model Ev`, produces a document
 * where `components.messages.Sales.Ev` describes something other than
 * `components.schemas["Sales.Ev"]`. No key actually collides, so
 * `duplicate-message-key` never fires, and the output stays valid. It is
 * only misleading, so this is a warning.
 * The check runs once every schema key is claimed, including the keys of the
 * discriminated subtypes a payload pulls in. A key claimed by the message's
 * own model is the normal case and reports nothing.
 */
function reportShadowedSchemaKeys(
  program: Program,
  schemas: SchemaBuilder,
  claimedBy: Map<string, Model>,
): void {
  for (const [key, model] of claimedBy) {
    const owner = schemas.schemaKeyOwner(key);
    if (owner !== undefined && owner !== model) {
      reportDiagnostic(program, {
        code: "message-key-shadows-schema-key",
        target: model,
        format: { name: key },
      });
    }
  }
}
