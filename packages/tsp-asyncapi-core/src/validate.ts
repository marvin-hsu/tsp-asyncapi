/**
 * What must hold of a program, whatever it is emitted as.
 *
 * The compiler binds a `$onValidate` export of the file `lib/main.tsp`
 * imports, and it runs that function on every compilation that loads this
 * library. So a rule here holds for a project that emits an AsyncAPI
 * document, for one that emits only schema files, and for one that emits
 * nothing at all and is being read in an editor.
 *
 * That reach is the reason to put a rule here rather than in `resolve`. A
 * rule about the input language is not about a document, and it should not
 * wait for one to be asked for.
 *
 * Reporting an error here stops the compilation before any emitter runs, so a
 * program this file rejects writes no files at all.
 *
 * This is not a fourth stage of the emitter. It reads decorator state and
 * writes nothing, and it produces no value that any stage consumes.
 */

import type { Model, Program } from "@typespec/compiler";
import { isHeader, listMessages } from "./decorators/index.js";
import { reportDiagnostic } from "./lib.js";
import { listProtobufMessageModels } from "./protobuf-state.js";
import { listAvroRecordModels } from "./avro-state.js";

/**
 * Runs every whole program check.
 *
 * @internal
 */
export function $onValidate(program: Program): void {
  reportHeadersOnGeneratedPayloads(program);
}

/** What a diagnostic calls the decorator that asked for a generated payload. */
const PROTOBUF = "@Protobuf.message";

/** The same, for the Avro side. */
const AVRO = "@Avro.avroRecord";

/**
 * Reports a field-level `@header` on a model that declares a binary schema.
 *
 * `@header` says a property travels beside the payload. Neither target
 * language has that idea. Protobuf gives every property of a message a field
 * number, and Avro gives every property of a record a field, so a property
 * the message does not carry inside its payload has nowhere to go and no way
 * to be marked as absent.
 *
 * Leaving the property out of the generated schema was the other option. It
 * makes the schema right and the standalone file wrong: `@typespec/protobuf`
 * and the Avro emitter both write the whole model, and neither reads an
 * AsyncAPI decorator. So the two files would describe different shapes for
 * one message, and nothing in either file would say so.
 *
 * `@headers` has neither problem. A separate model holds the headers, the
 * message model holds the payload, and every writer of every file agrees
 * about which fields belong where.
 */
function reportHeadersOnGeneratedPayloads(program: Program): void {
  const declares = new Map<Model, string>();
  for (const model of listProtobufMessageModels(program)) declares.set(model, PROTOBUF);
  for (const model of listAvroRecordModels(program)) declares.set(model, AVRO);
  if (declares.size === 0) return;

  for (const [message] of listMessages(program)) {
    const decorator = declares.get(message);
    if (decorator === undefined) continue;

    for (const property of message.properties.values()) {
      // Only the message's own properties. A mark on a model reached from one
      // is on something that is not a message, and the emitter reports that
      // separately and leaves the property where the author wrote it.
      if (!isHeader(program, property)) continue;

      reportDiagnostic(program, {
        code: "header-on-generated-payload",
        target: property,
        format: { name: property.name, message: message.name, decorator },
      });
    }
  }
}
