/**
 * Turns the intermediate structure into a JSON value, then into text.
 *
 * This file fixes two things the walk leaves undetermined. First, key
 * order: `JSON.stringify` writes keys in insertion order, and the walk
 * builds objects in whatever order its code runs. Rebuilding each object
 * here gives every schema the same key order, so two runs produce the same
 * bytes. Second, absence: a member the author declared none of is dropped,
 * so an absent `namespace` is absent rather than null.
 */

import { isAvroUnion, type AvroField, type AvroSchema } from "./types.js";

/**
 * A JSON value, as `JSON.stringify` accepts it.
 */
type JsonValue = null | boolean | number | string | JsonObject | readonly JsonValue[];

interface JsonObject {
  readonly [key: string]: JsonValue | undefined;
}

/**
 * Drops every member the walk left undefined.
 *
 * `JSON.stringify` drops such a member on its own, so this changes no file
 * output. It matters to a caller that embeds the value directly, such as a
 * YAML writer: that writer keeps an undefined member and writes it as null,
 * and null states something the author never wrote. An Avro record with no
 * namespace has no `namespace` member; it does not have a null one.
 */
function prune(object: JsonObject): JsonObject {
  const kept: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(object)) {
    if (value !== undefined) {
      kept[key] = value;
    }
  }
  return kept;
}

/**
 * Renders one field.
 *
 * Null is a default Avro allows, so a null default is written and an unset
 * default is dropped.
 */
function renderField(field: AvroField): JsonObject {
  return prune({
    name: field.name,
    type: renderSchema(field.type),
    doc: field.doc,
    default: field.default,
    order: field.order,
    aliases: field.aliases === undefined ? undefined : [...field.aliases],
  });
}

/**
 * Renders one schema as a JSON value.
 */
function renderSchema(schema: AvroSchema): JsonValue {
  if (typeof schema === "string") {
    return schema;
  }
  if (isAvroUnion(schema)) {
    return schema.map(renderSchema);
  }

  switch (schema.type) {
    case "record":
      return prune({
        type: "record",
        name: schema.name,
        namespace: schema.namespace,
        doc: schema.doc,
        aliases: schema.aliases === undefined ? undefined : [...schema.aliases],
        fields: schema.fields.map(renderField),
      });
    case "enum":
      return prune({
        type: "enum",
        name: schema.name,
        namespace: schema.namespace,
        doc: schema.doc,
        aliases: schema.aliases === undefined ? undefined : [...schema.aliases],
        symbols: [...schema.symbols],
        default: schema.default,
      });
    case "fixed":
      return prune({
        type: "fixed",
        name: schema.name,
        namespace: schema.namespace,
        aliases: schema.aliases === undefined ? undefined : [...schema.aliases],
        size: schema.size,
        logicalType: schema.logicalType,
        precision: schema.precision,
        scale: schema.scale,
      });
    case "array":
      return { type: "array", items: renderSchema(schema.items) };
    case "map":
      return { type: "map", values: renderSchema(schema.values) };
    default:
      // A primitive with a logical type. `type` holds the primitive name,
      // not one of the keywords the cases above match on.
      return prune({
        type: schema.type,
        logicalType: schema.logicalType,
        precision: schema.precision,
        scale: schema.scale,
      });
  }
}

/**
 * Renders one schema as the JSON value an Avro reader takes, including every
 * schema nested inside it.
 *
 * The answer is `unknown` because a caller writes it out rather than reads
 * it. A caller that embeds the value in another document needs this rather
 * than the rendered text below.
 *
 * @internal
 */
export function renderAvroSchema(schema: AvroSchema): unknown {
  return renderSchema(schema);
}

/**
 * Renders one schema as the text of an `.avsc` file.
 *
 * The text ends with a newline, so the file is well formed.
 *
 * @internal
 */
export function renderAvroFile(schema: AvroSchema): string {
  return `${JSON.stringify(renderAvroSchema(schema), undefined, 2)}\n`;
}
