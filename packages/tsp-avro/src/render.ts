/**
 * Turns the intermediate structure into a JSON value, then into text.
 *
 * The structure is already Avro shaped, so this file decides two things.
 *
 * The first is the order of the keys. `JSON.stringify` writes the keys of an
 * object in insertion order, and the walk builds its objects in whatever order
 * its code happens to run. Rebuilding each object here puts every schema in
 * the same order, which is what makes the output of two runs the same bytes.
 * The order follows the Avro specification: the type comes first, then the
 * name, then the rest.
 *
 * The second is what happens to a member the author declared none of. It is
 * dropped, so an absent `namespace` is absent rather than null.
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
 * `JSON.stringify` drops such a member on its own, so this changes no file.
 * It changes what a caller that embeds the value sees. A YAML writer keeps an
 * undefined member and writes it as null, and null states something the
 * author never wrote: an Avro record with no namespace has no `namespace`
 * member, it does not have a null one.
 *
 * `Object.entries` walks the keys in insertion order, so the order the case
 * below chose survives.
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
 * `default` comes last, and it is written whenever the walk set one. Null is a
 * default Avro allows, so null is written and undefined disappears.
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
      // A primitive with a logical type on it. Its `type` holds the primitive
      // name rather than a keyword, which is what the cases above match on.
      return prune({
        type: schema.type,
        logicalType: schema.logicalType,
        precision: schema.precision,
        scale: schema.scale,
      });
  }
}

/**
 * Renders one schema as the JSON value an Avro reader takes.
 *
 * The keys are in the order the Avro specification names them, and a member
 * the author declared none of is absent rather than null. Both hold for every
 * schema nested inside this one.
 *
 * The answer is `unknown` because a caller writes it out rather than reads it.
 * A caller that embeds the value in another document needs this rather than
 * the text below.
 *
 * @param schema - The schema to render
 * @returns The JSON value
 *
 * @internal
 */
export function renderAvroSchema(schema: AvroSchema): unknown {
  return renderSchema(schema);
}

/**
 * Renders one schema as the text of an `.avsc` file.
 *
 * The text ends with a newline, so the file is a well formed text file.
 *
 * @internal
 */
export function renderAvroFile(schema: AvroSchema): string {
  return `${JSON.stringify(renderAvroSchema(schema), undefined, 2)}\n`;
}
