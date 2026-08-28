/**
 * The printer: one payload structure to proto3 text.
 *
 * This is the whole output side. It reads the structure the walk built and
 * writes lines. It reads no state, resolves no name, and refuses nothing,
 * because every such decision was made before it ran.
 *
 * The text is deterministic. Declarations come in the order the walk reached
 * them, fields come in the order the model declares its properties, and the
 * indent is two spaces. So one program renders one text, every time.
 *
 * The layout is this emitter's own. A parity test compares what a parser
 * makes of this text with what it makes of the official emitter's text, and
 * that comparison is about types, numbers, labels, and names. Where a line
 * break falls is not part of it.
 */

import type {
  ProtoDeclaration,
  ProtoEnum,
  ProtoField,
  ProtoMessage,
  ProtoPayloadModel,
} from "./model.js";

/** The indent of one nesting level, as proto3 style writes it. */
const INDENT = "  ";

/**
 * Renders one payload as proto3 text.
 *
 * @param payload - The payload structure to print
 *
 * @returns The proto3 text, ending in exactly one newline
 * @internal
 */
export function renderProtoFile(payload: ProtoPayloadModel): string {
  const lines: string[] = ['syntax = "proto3";', ""];
  if (payload.packageName !== undefined) {
    lines.push(`package ${payload.packageName};`, "");
  }
  for (const declaration of payload.declarations) {
    lines.push(...renderDeclaration(declaration), "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

/**
 *  Renders one top level declaration.
 *
 * @param declaration - The message or enum to print
 */
function renderDeclaration(declaration: ProtoDeclaration): string[] {
  return declaration.kind === "message" ? renderMessage(declaration) : renderEnum(declaration);
}

/**
 *  Renders one `message` block.
 *
 * @param message - The message to print
 */
function renderMessage(message: ProtoMessage): string[] {
  const lines = renderDoc(message.doc, "");
  const reserved = renderReservations(message);
  if (message.fields.length === 0 && reserved.length === 0) {
    lines.push(`message ${message.name} {}`);
    return lines;
  }
  lines.push(`message ${message.name} {`, ...reserved);
  // The reserved lines and the fields are two groups, so a message that has
  // both gets a blank line between them.
  if (reserved.length > 0 && message.fields.length > 0) lines.push("");
  for (const field of message.fields) {
    lines.push(
      ...renderDoc(field.doc, INDENT),
      `${INDENT}${labelOf(field)}${field.type} ${field.name} = ${String(field.index)};`,
    );
  }
  lines.push("}");
  return lines;
}

/**
 * Renders what a message reserves, as the two lines proto3 gives it.
 *
 * proto3 keeps reserved numbers and reserved names apart, so a message that
 * reserves both gets two lines. A range is written with the `to` keyword,
 * proto3's spelling for an inclusive range.
 *
 * @param message - The message to read the reservations of
 */
function renderReservations(message: ProtoMessage): string[] {
  const lines: string[] = [];
  if (message.reservedNumbers.length > 0) {
    const written = message.reservedNumbers.map((one) =>
      typeof one === "number" ? String(one) : `${String(one[0])} to ${String(one[1])}`,
    );
    lines.push(`${INDENT}reserved ${written.join(", ")};`);
  }
  if (message.reservedNames.length > 0) {
    const quoted = message.reservedNames.map((one) => `"${one}"`);
    lines.push(`${INDENT}reserved ${quoted.join(", ")};`);
  }
  return lines;
}

/**
 * The label a field carries, with the trailing space it needs.
 *
 * A repeated field never also takes `optional`. The walk already applies
 * that rule, so this only writes down what the field says.
 *
 * @param field - The field to label
 */
function labelOf(field: ProtoField): string {
  if (field.repeated) return "repeated ";
  return field.optional ? "optional " : "";
}

/**
 *  Renders one `enum` block.
 *
 * @param target - The enum to print
 */
function renderEnum(target: ProtoEnum): string[] {
  const lines = renderDoc(target.doc, "");
  lines.push(`enum ${target.name} {`);
  if (target.allowAlias) lines.push(`${INDENT}option allow_alias = true;`);
  for (const variant of target.variants) {
    lines.push(
      ...renderDoc(variant.doc, INDENT),
      `${INDENT}${variant.name} = ${String(variant.value)};`,
    );
  }
  lines.push("}");
  return lines;
}

/**
 * Renders documentation as leading `//` lines.
 *
 * Each line of the documentation gets its own comment line, so a paragraph
 * written over several lines stays several lines. A type with no
 * documentation renders as nothing, not an empty comment.
 *
 * @param doc - The documentation, if the type has any
 * @param indent - The indent the block sits at
 */
function renderDoc(doc: string | undefined, indent: string): string[] {
  if (doc === undefined || doc === "") return [];
  return doc.split("\n").map((line) => (line === "" ? `${indent}//` : `${indent}// ${line}`));
}
