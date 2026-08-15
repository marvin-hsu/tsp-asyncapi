import { Model, Program, serializeValueAsJson, Value } from "@typespec/compiler";
import { $ } from "@typespec/compiler/typekit";
import { getMessageExamples, MessageExampleState } from "../../decorators/index.js";
import { reportDiagnostic } from "../../lib.js";
import { MessageExampleObject } from "../../types/index.js";
import { makeSerializeHandlers } from "../example-serialization.js";
import { orderBySourceNodes } from "../source-order.js";
import { present, text } from "../optional-fields.js";

/**
 * Builds the `examples` array of one message, or returns `undefined` when
 * the message carries no example.
 *
 * AsyncAPI's `examples` is an array of Message Example Objects, not a map.
 * So every application of `@messageExample` contributes one entry, and the
 * entries keep their source order. `@messageExample` is repeatable for that
 * reason: one message often shows several situations, each with its own
 * `name`.
 *
 * A field with nothing to say is left out. Every entry carries at least one
 * of `headers` and `payload`, which the decorator already enforces.
 */
export function buildMessageExamples(
  program: Program,
  model: Model,
): MessageExampleObject[] | undefined {
  const recorded = getMessageExamples(program, model);
  if (recorded.length === 0) {
    return undefined;
  }
  const ordered = orderBySourceNodes(
    program,
    recorded.map((example) => example.node),
    recorded,
  );
  const examples = ordered
    .map((example) => buildMessageExample(program, example))
    .filter((example) => example !== undefined);
  return examples.length > 0 ? examples : undefined;
}

/**
 * Builds one Message Example Object.
 *
 * Returns `undefined` when the example cannot be serialized. The whole entry
 * is dropped in that case. An entry that lost its only content field would
 * otherwise claim the message has an example that shows nothing.
 */
function buildMessageExample(
  program: Program,
  example: MessageExampleState,
): MessageExampleObject | undefined {
  try {
    const headers = serializeExampleValue(program, example.headers);
    const payload = serializeExampleValue(program, example.payload);
    return {
      ...text("name", example.name),
      ...text("summary", example.summary),
      ...present("headers", example.headers === undefined ? undefined : headers),
      ...present("payload", example.payload === undefined ? undefined : payload),
    };
  } catch {
    // An example that carries no usable information is dropped rather than
    // left to crash the whole emit. This covers an unserializable scalar per
    // `UnserializableValueError`, and any other failure. The compiler's own
    // duration serializer, for one, throws a plain `RangeError` on a
    // malformed `duration.fromISO(...)` value that it never validates.
    // The drop still surfaces as a diagnostic, rather than happening in
    // total silence. It points at this application, not at the model, so the
    // user sees which of several examples was dropped.
    reportDiagnostic(program, { code: "unserializable-message-example", target: example.node });
    return undefined;
  }
}

/**
 * Turns one raw example value into plain JSON.
 *
 * The value is serialized against `unknown` rather than against the message
 * schema. An example is free-form: `headers` and `payload` are declared
 * `unknown` on the decorator, and the emitter does not check the content
 * against the message. Serializing against `unknown` keeps every property
 * the user wrote, and it still resolves each scalar through its own type. So
 * a `utcDateTime` reaches the document as an ISO string rather than as the
 * compiler's internal value object.
 */
function serializeExampleValue(program: Program, value: Value | undefined): unknown {
  if (value === undefined) {
    return undefined;
  }
  return serializeValueAsJson(
    program,
    value,
    $(program).intrinsic.any,
    undefined,
    makeSerializeHandlers(program),
  );
}
