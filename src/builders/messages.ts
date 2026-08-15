import { getFriendlyName, Model, Program } from "@typespec/compiler";
import { MessageObject } from "../types/index.js";
import { reportDiagnostic } from "../lib.js";
import { listMessages, MessageState } from "../decorators/index.js";
import { SchemaBuilder } from "./schemas/builder.js";
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
 * Builds one Message Object.
 * The payload is always a `$ref` to the model's `components.schemas` entry.
 * A `@message` target is a top-level declaration, so it is never inlined.
 * `buildDeclarationRef` is what enforces that; plain `buildSchema` would
 * inline a declaration with no compact composed name, and the same body
 * could then be emitted both inside the message and as a component.
 * The key is taken from the builder rather than recomputed here, so
 * namespace qualification, `@friendlyName`, and sanitization stay in one
 * place.
 * Later steps add `headers`, `correlationId`, `examples`, and `tags` here.
 */
function buildMessage(schemas: SchemaBuilder, model: Model): MessageObject {
  return { payload: schemas.buildDeclarationRef(model) };
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
      }
      continue;
    }
    claimedBy.set(key, model);
    messages[key] = buildMessage(schemas, model);
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
