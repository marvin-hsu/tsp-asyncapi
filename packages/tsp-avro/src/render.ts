/**
 * Turns the intermediate structure into a JSON value, then into text.
 *
 * The structure is already Avro shaped, so this file decides one thing: the
 * order of the keys. `JSON.stringify` writes the keys of an object in
 * insertion order, and the walk builds its objects in whatever order its code
 * happens to run. Rebuilding each object here puts every schema in the same
 * order, which is what makes the output of two runs the same bytes.
 *
 * The order follows the Avro specification: the type comes first, then the
 * name, then the rest.
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
 * Renders one field.
 *
 * `default` comes last, and it is written whenever the walk set one. Null is a
 * default Avro allows, so null is written and undefined disappears.
 */
function renderField(field: AvroField): JsonObject {
  return {
    name: field.name,
    type: renderSchema(field.type),
    doc: field.doc,
    default: field.default,
  };
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
      return {
        type: "record",
        name: schema.name,
        namespace: schema.namespace,
        doc: schema.doc,
        fields: schema.fields.map(renderField),
      };
    case "enum":
      return {
        type: "enum",
        name: schema.name,
        namespace: schema.namespace,
        doc: schema.doc,
        symbols: [...schema.symbols],
      };
    case "array":
      return { type: "array", items: renderSchema(schema.items) };
    case "map":
      return { type: "map", values: renderSchema(schema.values) };
  }
}

/**
 * Renders one schema as the text of an `.avsc` file.
 *
 * An undefined member disappears, because `JSON.stringify` drops it. That is
 * the whole rule for an optional Avro field: `namespace` and `doc` are absent
 * rather than null when the author declared none.
 *
 * The text ends with a newline, so the file is a well formed text file.
 *
 * @internal
 */
export function renderAvroFile(schema: AvroSchema): string {
  return `${JSON.stringify(renderSchema(schema), undefined, 2)}\n`;
}
