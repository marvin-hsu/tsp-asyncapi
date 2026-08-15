import {
  isArrayModelType,
  Model,
  ModelProperty,
  navigateType,
  Program,
  resolveEncodedName,
  walkPropertiesInherited,
} from "@typespec/compiler";
import { SchemaObject, ReferenceObject } from "../../types/index.js";
import { reportDiagnostic } from "../../lib.js";
import { getContentType, getHeadersModel, isHeader } from "../../decorators/index.js";
import { SchemaBuilder } from "../schemas/builder.js";
import { SCHEMA_ENCODING_MIME_TYPE } from "../schemas/annotations.js";

/** The `contentType` of a message has its own field, so it is never a header. */
const CONTENT_TYPE_HEADER = "content-type";

/**
 * Where one message takes its headers from.
 * Exactly one of the two members carries the headers. `fields` holds the
 * message model's own top-level fields that `@header` marks. `model` holds
 * the model that message-level `@headers` names.
 */
interface HeaderSource {
  readonly fields: readonly ModelProperty[];
  readonly model?: Model;
}

/**
 * The headers of every message, resolved before any schema is built.
 * `sources` is the source of truth, and it answers per message. The message
 * builder reads the fields of the message it is building, and those fields
 * leave that message's payload component alone. The model's own component
 * still describes them for every other reader.
 */
export interface MessageHeaderPlan {
  /** The header source of each message model that declares headers. */
  readonly sources: Map<Model, HeaderSource>;
  /**
   * Every top-level field of a message model that `@header` marks, whether
   * or not it was lifted. A conflict cancels the lifting but leaves the mark
   * in a place the emitter does support, so this set is what tells a
   * misplaced mark from a cancelled one.
   */
  readonly topLevel: Set<ModelProperty>;
}

/**
 * Resolves where each message takes its headers from, and reports every
 * conflict between the two mechanisms.
 *
 * This runs before any schema is built, for two reasons. The lifted fields
 * must reach the schema builder before it builds the payload that would
 * otherwise still describe them. And a message model can be reached through
 * another message's payload, so the first build of it can happen at any
 * point in the message loop.
 *
 * A message that declares both a field-level `@header` and a message-level
 * `@headers` gets neither. There is no rule that picks one, so picking one
 * anyway would invent an order the user cannot see. The error says so.
 * The fields still stay in the payload in that case, so nothing the user
 * wrote disappears from the document while the error is unresolved.
 */
export function planMessageHeaders(program: Program, messages: Iterable<Model>): MessageHeaderPlan {
  const sources = new Map<Model, HeaderSource>();
  const lifted: ModelProperty[] = [];
  const topLevel = new Set<ModelProperty>();
  const messageList = [...messages];
  // One field can reach the content type check from more than one message. A
  // base message declares it, and every message that extends the base adopts
  // it. See `reportContentTypeHeaders`.
  const contentTypeReported = new Set<ModelProperty>();

  for (const message of messageList) {
    const fields = [...message.properties.values()].filter((property) =>
      isHeader(program, property),
    );
    const model = getHeadersModel(program, message);
    for (const field of fields) {
      topLevel.add(field);
    }

    if (fields.length > 0 && model !== undefined) {
      reportDiagnostic(program, { code: "duplicate-message-headers", target: message });
      continue;
    }
    if (model !== undefined) {
      if (isObjectBacked(model)) {
        // The content type conflict is checked on this route too. A
        // `@headers` model that declares a `content-type` property next to a
        // `@contentType` on the message states the same value twice, which is
        // the ambiguity the check exists to forbid. The whole `baseModel`
        // chain is walked, because an inherited property reaches the emitted
        // headers schema as well.
        reportContentTypeHeaders(
          program,
          message,
          [...walkPropertiesInherited(model)],
          contentTypeReported,
        );
        sources.set(message, { fields: [], model });
      } else {
        reportDiagnostic(program, {
          code: "headers-not-object",
          target: message,
          format: { name: model.name },
        });
      }
      continue;
    }
    if (fields.length === 0) {
      continue;
    }
    reportContentTypeHeaders(program, message, fields, contentTypeReported);
    sources.set(message, { fields });
    lifted.push(...fields);
  }

  adoptInheritedLiftedFields(program, messageList, sources, new Set(lifted), contentTypeReported);
  return { sources, topLevel };
}

/**
 * Gives a message the header fields that its base model already lifts.
 *
 * A lifted field leaves the payload of the message that declares it. A
 * message that extends that model inherits the field. A reader of the base
 * message finds the field in `headers`, and expects a specialisation of that
 * message to describe it in the same place.
 *
 * So the derived message repeats the header. Its payload then omits the field
 * too, because the payload component is built from the fields the message
 * keeps.
 *
 * This runs after every message resolved its own source, because a base model
 * can come later in the list than the message that extends it.
 *
 * The fields are not added to `lifted` again. That list records each field
 * once, and the derived message carries the field in its own source instead.
 *
 * A message that carries `@headers` is left out. That model describes the
 * whole headers object on its own, so adding a field to it would emit a
 * headers schema the user never wrote. The inherited field then stays in the
 * payload of that message while it is a header of the base message, so the
 * pair is reported. See `reportOverriddenInheritedHeaders`.
 *
 * A message with an unresolved `duplicate-message-headers` error is left out
 * as well, and it is not reported. Neither mechanism takes effect there, so
 * the emitter has nothing to say about which of them wins.
 */
function adoptInheritedLiftedFields(
  program: Program,
  messages: readonly Model[],
  sources: Map<Model, HeaderSource>,
  lifted: ReadonlySet<ModelProperty>,
  contentTypeReported: Set<ModelProperty>,
): void {
  for (const message of messages) {
    const source = sources.get(message);
    const inherited = [...walkPropertiesInherited(message)].filter(
      (property) => !message.properties.has(property.name) && lifted.has(property),
    );
    if (inherited.length === 0) {
      continue;
    }
    if (getHeadersModel(program, message) !== undefined) {
      if (source?.model !== undefined) {
        reportOverriddenInheritedHeaders(program, message, inherited);
      }
      continue;
    }
    // The inherited fields come first. They reach the payload through the
    // `allOf` of the base model, so this is the order the source declares
    // them in.
    const fields = [...inherited, ...(source?.fields ?? [])];
    reportContentTypeHeaders(program, message, inherited, contentTypeReported);
    sources.set(message, { fields });
  }
}

/**
 * Reports each field a `@headers` model pushes back into the payload.
 *
 * The base message lifts the field into its own `headers`. The derived
 * message describes its whole headers object with `@headers`, so the lift is
 * cancelled and the field stays in its payload. One field is then a header of
 * one message and payload data of the other. The emitted document shows both
 * halves and neither the link between them nor the cause, so the emitter
 * names it.
 *
 * The diagnostic targets the derived message. That is where the `@headers`
 * sits, and it is the decorator the author chooses between keeping and
 * dropping.
 */
function reportOverriddenInheritedHeaders(
  program: Program,
  message: Model,
  inherited: readonly ModelProperty[],
): void {
  for (const field of inherited) {
    reportDiagnostic(program, {
      code: "inherited-header-overridden",
      target: message,
      format: {
        field: field.name,
        base: field.model?.name ?? "",
        message: message.name,
      },
    });
  }
}

/**
 * Builds the `headers` schema of one message, or returns `undefined` when
 * the message declares none.
 *
 * A `@headers` model is emitted as a `components.schemas` declaration and
 * referenced, the same treatment a payload model gets. Headers are usually
 * shared by several messages, so one component and several `$ref`s beats one
 * copy per message that can drift.
 *
 * Fields marked `@header` have no model of their own. They are a subset of
 * the message model's fields, so they are assembled into an inline object
 * schema. Each field keeps the wire name, documentation, and validation
 * keywords it would have had in the payload.
 */
export function buildMessageHeaders(
  schemas: SchemaBuilder,
  plan: MessageHeaderPlan,
  message: Model,
): SchemaObject | ReferenceObject | undefined {
  const source = plan.sources.get(message);
  if (source === undefined) {
    return undefined;
  }
  if (source.model !== undefined) {
    return schemas.buildDeclarationRef(source.model);
  }
  return schemas.buildPropertiesSchema(source.fields);
}

/**
 * Reports every `@header` that the emitter cannot honour.
 *
 * A mark is honoured on a top-level field of a message model only. The
 * payload of a message is one object, and its headers are a sibling of that
 * object. A field two levels down has no such sibling to move to; lifting it
 * would silently restructure the payload around it. `@typespec/http` reads
 * metadata off the top level for the same reason, and warns about the marks
 * it leaves in place.
 *
 * The walk starts from each message model and follows its whole payload
 * graph. So a mark inside a model that a payload merely refers to is found
 * too. A mark the emitter never reaches from any message is left alone; it
 * describes nothing this document emits. A mark inside a `@headers` model is
 * left alone as well: everything in that model is already a header, so the
 * mark neither adds nor removes a field there.
 *
 * `honoured` holds every top-level field of a message model that carries the
 * mark, including the fields a `duplicate-message-headers` error just
 * cancelled. Those are already reported once. Reporting them again, as if
 * they sat in the wrong place, would send the user to the wrong fix.
 *
 * A mark on a property the message inherits through `extends` gets its own
 * diagnostic. That property is a top-level field of the emitted payload, so
 * the ordinary message would name a cause the user cannot act on. The rule
 * itself is the same: only a property the message model declares itself is
 * lifted. A base model is a declaration of its own, shared by every model
 * that extends it, and the payload refers to it through `allOf`. Lifting a
 * field out of it would change every other user of that base model too. The
 * spread form, `...Base`, copies the properties into the message model
 * instead, so those fields are the message's own and are lifted.
 *
 * One inherited mark is honoured, and it is not reported here. A base model
 * that is a message of its own already lifts its own fields. The derived
 * message inherits those headers rather than losing them. See
 * `adoptInheritedLiftedFields`. Such a property is in `honoured`, because it
 * is a top-level field of the base message.
 */
export function reportIgnoredNestedHeaders(
  program: Program,
  messages: Iterable<Model>,
  honoured: ReadonlySet<ModelProperty>,
): void {
  const inherited = collectInheritedProperties(messages);
  const reported = new Set<ModelProperty>();
  for (const message of messages) {
    navigateType(
      message,
      {
        modelProperty: (property) => {
          if (honoured.has(property) || reported.has(property) || !isHeader(program, property)) {
            return;
          }
          reported.add(property);
          const owner = inherited.get(property);
          if (owner !== undefined) {
            reportDiagnostic(program, {
              code: "inherited-header-ignored",
              target: property,
              format: { message: owner },
            });
            return;
          }
          reportDiagnostic(program, { code: "nested-header-ignored", target: property });
        },
      },
      {},
    );
  }
}

/**
 * Maps every property a message inherits through `extends` to the name of
 * that message.
 * The message's own properties are not in the map. They are lifted, so they
 * never reach the reporting above.
 * A base model shared by two messages maps to the first of them. The message
 * name only makes the diagnostic concrete, and either name points the reader
 * at the same base model.
 */
function collectInheritedProperties(messages: Iterable<Model>): Map<ModelProperty, string> {
  const inherited = new Map<ModelProperty, string>();
  for (const message of messages) {
    for (const property of walkPropertiesInherited(message)) {
      if (message.properties.has(property.name) || inherited.has(property)) {
        continue;
      }
      inherited.set(property, message.name);
    }
  }
  return inherited;
}

/**
 * Reports a header field that names the message content type while the
 * message also carries `@contentType`.
 *
 * AsyncAPI keeps the content type in its own message field, so two sources
 * for one value cannot both be honoured. `@typespec/http` reclassifies such
 * a header as the content type, because HTTP has no other way to state it.
 * This emitter does have another way, `@contentType`, so it reports the pair
 * instead of choosing silently.
 *
 * The name compared is the field's wire name, the name that would appear in
 * the emitted headers schema, and the comparison ignores case. HTTP header
 * names are case-insensitive, and a reader matching `Content-Type` against
 * `content-type` finds the same header.
 *
 * The field stays a header. The error already stops the build, and dropping
 * it as well would make the emitted document disagree with the source about
 * a second thing.
 *
 * One field is reported once. `reported` holds the fields already named, and
 * it is shared by every call of one plan. A message that extends a lifting
 * base adopts the base's header field, so the same field reaches this check
 * from both messages. The diagnostic names no message and targets the field
 * itself, so a second report would repeat the same text on the same squiggle.
 */
function reportContentTypeHeaders(
  program: Program,
  message: Model,
  fields: readonly ModelProperty[],
  reported: Set<ModelProperty>,
): void {
  if (getContentType(program, message) === undefined) {
    return;
  }
  for (const field of fields) {
    const name = resolveEncodedName(program, field, SCHEMA_ENCODING_MIME_TYPE);
    if (name.toLowerCase() === CONTENT_TYPE_HEADER && !reported.has(field)) {
      reported.add(field);
      reportDiagnostic(program, {
        code: "content-type-header-conflict",
        target: field,
        format: { name },
      });
    }
  }
}

/**
 * Tells whether `model` emits an object schema.
 * An array-backed model, `model Names is string[]` or a model that extends
 * one, emits `type: "array"`. AsyncAPI requires the headers schema to be a
 * key/value map, so such a model cannot describe headers.
 * A record-backed model, `model Bag is Record<string>`, is an object with an
 * `additionalProperties` constraint. It is a legal headers schema.
 * The whole `baseModel` chain is walked. The array shape is inherited, so
 * only the chain shows it.
 */
function isObjectBacked(model: Model): boolean {
  for (let current: Model | undefined = model; current !== undefined; current = current.baseModel) {
    if (isArrayModelType(current)) {
      return false;
    }
  }
  return true;
}
