/**
 * What one message takes its headers from, and the lifting that follows.
 *
 * It reads three decorator states across every message model: a field-level
 * `@header` mark, a model-level `@headers`, and a model-level `@rawHeaders`.
 * A message names at most one of the three; a message that names more than
 * one gets none of them, reported as `duplicate-message-headers`.
 *
 * It decides, for every message, which of the three sources describes its
 * headers, and which fields a `@header` mark lifts out of the payload. A
 * lifted field is inherited by every message that extends the one that lifts
 * it, so the resulting plan covers the whole program, not one message at a
 * time.
 *
 * It also reports every conflict the three mechanisms can produce. A mark
 * can reach no top-level field. A content type can be stated twice. A lift
 * can be overridden by a derived message's own `@headers`. A lift can name
 * a field a raw payload cannot honour.
 *
 * It does not build a headers schema. The plan names the source; expanding a
 * model or a set of fields into a schema is the lower half's work.
 */

import {
  isArrayModelType,
  Model,
  ModelProperty,
  navigateType,
  Program,
  resolveEncodedName,
  walkPropertiesInherited,
} from "@typespec/compiler";
import { reportDiagnostic } from "../../lib.js";
import {
  getContentType,
  getHeadersModel,
  getRawHeaders,
  getRawPayload,
  isHeader,
  RawSchemaState,
} from "../../decorators/index.js";
import { SCHEMA_ENCODING_MIME_TYPE } from "../../constants.js";

/** The `contentType` of a message has its own field, so it is never a header. */
const CONTENT_TYPE_HEADER = "content-type";

/**
 * Where one message takes its headers from.
 * Exactly one of the three members carries the headers. `fields` holds the
 * message model's own top-level fields that `@header` marks. `model` holds
 * the model that message-level `@headers` names. `raw` holds the schema that
 * `@rawHeaders` records, in a format the emitter does not read.
 * `fields` is empty on the other two routes, because neither of them lifts a
 * field out of the payload.
 */
export interface HeaderSource {
  readonly fields: readonly ModelProperty[];
  readonly model?: Model;
  readonly raw?: RawSchemaState;
}

/**
 * The members of a header source that describe the whole headers object.
 *
 * `fields` is not one of them. It holds single fields, so it combines with
 * fields a base message lifts. The two members here each fill the whole
 * object, so neither combines with anything.
 *
 * Three places ask this question. Naming the members here, instead of at
 * each call site, keeps a fourth source or a renamed member to one edit.
 */
const WHOLE_HEADER_MEMBERS = ["model", "raw"] as const;

/**
 *  Reads the two decorators that each describe the whole headers object.
 *
 * @param program - The program to read the state from
 * @param message - The message these headers belong to
 */
function wholeHeaderDecorators(program: Program, message: Model): Partial<HeaderSource> {
  return {
    model: getHeadersModel(program, message),
    raw: getRawHeaders(program, message),
  };
}

/**
 * Tells whether a header source describes the whole headers object.
 *
 * The argument is either a resolved source or the decorators one message
 * carries. The two answer different questions. A message can carry
 * `@rawHeaders` and still have no source, because a
 * `duplicate-message-headers` error dropped it.
 *
 * @param source - The type that declared the headers
 */
function describesWholeHeaders(source: Partial<HeaderSource> | undefined): boolean {
  return source !== undefined && WHOLE_HEADER_MEMBERS.some((key) => source[key] !== undefined);
}

/**
 * Counts the header sources one message declares.
 *
 * A count above one is the conflict `duplicate-message-headers` names. The
 * lifted fields count as one source together, because they describe one
 * headers object between them.
 *
 * @param fields - The fields already collected
 * @param declared - The parameter names the channel already declared
 */
function countHeaderSources(
  fields: readonly ModelProperty[],
  declared: Partial<HeaderSource>,
): number {
  const whole = WHOLE_HEADER_MEMBERS.filter((key) => declared[key] !== undefined).length;
  return fields.length === 0 ? whole : whole + 1;
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
 * conflict between the mechanisms.
 *
 * This runs before any schema is built. The lifted fields must reach the
 * schema builder before it builds a payload that would otherwise still
 * describe them, and a message model can be reached through another
 * message's payload at any point in the loop.
 *
 * A message that names more than one of the three header sources gets none
 * of them. The three sources are a field-level `@header`, a model-level
 * `@headers`, and a model-level `@rawHeaders`. No rule picks a winner, so the
 * conflict is reported instead. The fields stay in the payload while the
 * error is unresolved, so nothing the author wrote disappears from the
 * document.
 *
 * @param program - The program to read the state from
 * @param messages - The messages this channel carries
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
    const declared = wholeHeaderDecorators(program, message);
    const { model, raw } = declared;
    for (const field of fields) {
      topLevel.add(field);
    }

    if (countHeaderSources(fields, declared) > 1) {
      reportDiagnostic(program, { code: "duplicate-message-headers", target: message });
      continue;
    }
    if (raw !== undefined) {
      // The schema is opaque, so no field of it can be checked against
      // `@contentType`. The content type check below runs on the two routes
      // whose fields the emitter can read.
      sources.set(message, { fields: [], raw });
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
  reportRawPayloadLifting(program, messageList, sources);
  return { sources, topLevel };
}

/**
 * Reports every message that lifts `@header` fields out of a raw payload.
 *
 * A lifting message normally gets its own payload component, built without
 * the lifted fields. A raw payload is opaque, so the emitter cannot leave
 * anything out of it. The Avro or Protobuf record may still declare the
 * field the message claims as a header, and that contradiction must not be
 * silent.
 *
 * Both halves are still emitted, the raw payload as written and the lifted
 * fields as `headers`. This departs from `duplicate-message-headers`, which
 * drops both sources when two of them fill one field. Here the two things
 * fill two different fields of the Message Object, so nothing is dropped.
 * The diagnostic names the one thing the emitter cannot do, which is edit
 * the opaque payload.
 *
 * No derived payload key is claimed either, because the payload builder
 * never reaches the schema layer for a raw payload.
 *
 * This runs after the inherited lifts are adopted, so a message that
 * inherits its header fields from a base message is reported too.
 *
 * @param program - The program to read the state from
 * @param messages - The messages this channel carries
 * @param sources - The types that declared headers
 */
function reportRawPayloadLifting(
  program: Program,
  messages: readonly Model[],
  sources: ReadonlyMap<Model, HeaderSource>,
): void {
  for (const message of messages) {
    const source = sources.get(message);
    if (source === undefined || source.fields.length === 0) {
      continue;
    }
    if (getRawPayload(program, message) === undefined) {
      continue;
    }
    reportDiagnostic(program, {
      code: "raw-payload-lifted-header",
      target: message,
      format: { name: message.name },
    });
  }
}

/**
 * Gives a message the header fields that its base model already lifts.
 *
 * A lifted field leaves the payload of the message that declares it, and a
 * message that extends that model inherits the field. So the derived
 * message repeats the header, and its own payload omits the field too.
 *
 * This runs after every message resolves its own source, because a base
 * model can come later in the list than the message that extends it. The
 * fields are not added to `lifted` again. The derived message carries the
 * field in its own source instead.
 *
 * A message that carries `@headers` or `@rawHeaders` is left out. Either
 * would emit a headers schema the author never wrote. The inherited field
 * then stays in that message's payload while it is a header of the base, so
 * the pair is reported. See `reportOverriddenInheritedHeaders`.
 *
 * A message with an unresolved `duplicate-message-headers` error is left out
 * too. It is not reported, because neither mechanism takes effect there.
 *
 * @param program - The program to read the state from
 * @param messages - The messages this channel carries
 * @param sources - The types that declared headers
 * @param lifted - The header fields already lifted from the payload
 * @param contentTypeReported - Whether a content-type clash was already reported
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
    if (describesWholeHeaders(wholeHeaderDecorators(program, message))) {
      if (describesWholeHeaders(source)) {
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
 *
 * @param program - The program to read the state from
 * @param message - The message these headers belong to
 * @param inherited - The headers inherited from the channel
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
 * Reports every `@header` mark the emitter cannot honour.
 *
 * A mark is honoured only on a top-level field of a message model. The
 * payload is one object, and its headers are a sibling of it. A nested
 * field has no such sibling to move to, so lifting it would silently
 * restructure the payload around it. `@typespec/http` applies the same rule
 * and warns about the marks it leaves in place.
 *
 * The walk starts at each message model and follows its whole payload
 * graph, so a mark inside a model a payload merely refers to is found too.
 * A mark the emitter never reaches from any message is left alone, and so
 * is a mark inside a `@headers` model: every field there is already a
 * header.
 *
 * `honoured` holds every top-level field of a message model that carries
 * the mark, including fields a `duplicate-message-headers` error just
 * cancelled. Those already got a report, so this function does not name
 * them again.
 *
 * A mark on a property inherited through `extends` gets its own diagnostic,
 * because the ordinary message would name a cause the author cannot act on.
 * The rule is the same: only a property the message model declares itself
 * is lifted. A base model is shared by every model that extends it, so
 * lifting a field out of it would change every other user of that base. The
 * spread form, `...Base`, copies properties into the message model instead,
 * so those fields are the message's own and are lifted.
 *
 * One inherited mark is honoured and not reported here: a base model that
 * is itself a message already lifts its own fields, and the derived message
 * inherits those headers instead of losing them. See
 * `adoptInheritedLiftedFields`.
 *
 * A message with `@rawPayload` is not a walk root. Both diagnostics tell the
 * author the mark stays in the payload schema, and that message builds no
 * payload schema from its model. A mark inside a model some other, non-raw
 * message also reaches is still reported from that message's walk.
 *
 * @param program - The program to read the state from
 * @param messages - The messages this channel carries
 * @param honoured - The messages whose headers were already applied
 */
export function reportIgnoredNestedHeaders(
  program: Program,
  messages: Iterable<Model>,
  honoured: ReadonlySet<ModelProperty>,
): void {
  const inherited = collectInheritedProperties(messages);
  const reported = new Set<ModelProperty>();
  for (const message of messages) {
    if (getRawPayload(program, message) !== undefined) {
      continue;
    }
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
 *
 * @param messages - The messages this channel carries
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
 * the emitted headers schema, compared case-insensitively. HTTP header
 * names ignore case, so `Content-Type` and `content-type` name the same
 * header.
 *
 * The field stays a header. The error already stops the build.
 *
 * `reported` holds the fields already named, shared across every call of
 * one plan. A message that extends a lifting base adopts the same field, so
 * this keeps that field from being reported twice.
 *
 * @param program - The program to read the state from
 * @param message - The message these headers belong to
 * @param fields - The fields already collected
 * @param reported - The header names already reported
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
 *
 * @param model - The model to inspect
 */
function isObjectBacked(model: Model): boolean {
  for (let current: Model | undefined = model; current !== undefined; current = current.baseModel) {
    if (isArrayModelType(current)) {
      return false;
    }
  }
  return true;
}

/**
 * The header source recorded for one message, if it declares headers.
 *
 * The plan is built for the whole program, so reading one message out of it
 * is the only thing a caller ever needs. Exposing the map itself would let a
 * caller ask a question the plan does not answer.
 *
 * @param plan - The plan for the whole program
 * @param message - The message model to look up
 * @returns The source, or `undefined` when the message declares no header
 * @internal
 */
export function headerSourceOf(plan: MessageHeaderPlan, message: Model): HeaderSource | undefined {
  return plan.sources.get(message);
}

/**
 * The fields one message lifted out of its own payload.
 *
 * The plan records a header source per message, so the answer is local to one
 * message rather than shared across every message that reaches the same
 * model. A message that lifts nothing gets an empty set, and its payload stays
 * a reference to the model's own component. A message whose headers come from
 * `@headers` or `@rawHeaders` lifts no field, so its source carries an empty
 * field list.
 *
 * @param plan - The plan for the whole program
 * @param model - The message model to look up
 * @returns The lifted fields, empty when the message lifts none
 * @internal
 */
export function liftedOf(plan: MessageHeaderPlan, model: Model): ReadonlySet<ModelProperty> {
  return new Set(plan.sources.get(model)?.fields ?? []);
}
