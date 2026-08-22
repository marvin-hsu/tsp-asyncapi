import type {
  AsyncAPIDocument,
  ChannelObject,
  ComponentsObject,
  InfoObject,
  ReferenceObject,
  MessageObject,
  OperationObject,
  SchemaObject,
  SecuritySchemeObject,
  ServerObject,
} from "../../src/types/index.js";

/**
 * Readers for the sections of an emitted document.
 *
 * Every section of `AsyncAPIDocument` is optional, because a document with no
 * channel is a legal document. So a test reading `doc.channels.orders` does
 * not compile, and the two obvious ways out are both bad: `!` says nothing
 * when the section is missing, and `?.` walks on and fails several lines later
 * on a value nobody can trace back.
 *
 * These readers take the third way. A missing section throws where it is
 * read, and says which section it was. `test/setup.ts` records the same
 * reasoning for the AsyncAPI matchers: an assertion belongs at the place that
 * needs it, with a message a reader can act on.
 *
 * They accept a null document as well, because `emitDocumentWithDiagnostics`
 * returns null when the emitter wrote nothing. A test that reads a section is
 * a test that expects a document, so null belongs with the missing sections
 * rather than in every call site.
 *
 * A test asserting a section is *absent* should not use these. Read the field
 * directly and assert on it, since absence is the outcome under test.
 *
 * The keys inside a section are not guarded. `noUncheckedIndexedAccess` is
 * off, so `channelsOf(doc).orders` type-checks, and a missing key gives an
 * `undefined` that the following assertion reports on its own.
 *
 * A reader is added when the first test needs it, so every one of them has a
 * caller. `knip` enforces that.
 */
function section<T>(
  doc: AsyncAPIDocument | null,
  read: (doc: AsyncAPIDocument) => T | undefined,
  name: string,
): T {
  if (doc === null) {
    throw new Error("The emitter wrote no document, so this test cannot read `" + name + "`.");
  }
  const value = read(doc);
  if (value === undefined) {
    throw new Error(`The document has no \`${name}\`, so this test cannot read it.`);
  }
  return value;
}

/**
 * A field the document type makes optional, where the test needs it present.
 *
 * The readers above cover the top-level sections. This covers a field nested
 * inside one, such as a channel's `bindings` or a security scheme's `flows`.
 *
 * `?.` is the wrong tool for those. It reads as caution but it changes what
 * the assertion says: `expect(scheme.flows?.clientCredentials)
 * .not.toHaveProperty("refreshUrl")` passes when there are no flows at all,
 * which is the opposite of what the test means. This throws instead, and names
 * the field so the failure points at the fixture rather than the claim.
 *
 * @param value - The optional field
 * @param name - What to call it in the failure message
 * @returns The field, once it is known to be there
 */
export function present<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`This test needs \`${name}\`, and the document has none.`);
  }
  return value;
}

/**
 * The `$ref` of a value the test expects to be a reference.
 *
 * Anywhere the document holds a schema it may hold a reference instead, so the
 * type is a union and `$ref` is on one arm of it. A test that reads `$ref` has
 * already decided which arm it wants; this says so, and fails naming the other
 * one when the emitter inlined instead of referring.
 *
 * @param value - A schema or a reference
 * @param name - What to call it in the failure message
 * @returns The pointer
 */
export function refOf(
  value: SchemaObject | ReferenceObject | undefined,
  name = "the value",
): string {
  if (value === undefined) {
    throw new Error(`This test needs ${name} to be a reference, and there is nothing there.`);
  }
  // `SchemaObject` declares `$ref` as well, so the two arms of the union
  // overlap and `"$ref" in value` narrows nothing. The value of the field is
  // what tells them apart: a reference always has one.
  if (value.$ref === undefined) {
    throw new Error(`This test needs ${name} to be a reference, but the emitter inlined a schema.`);
  }
  return value.$ref;
}

/**
 * The schema of a value the test expects to be inline rather than a reference.
 *
 * The counterpart to `refOf`, for the other arm of the same union.
 *
 * @param value - A schema or a reference
 * @param name - What to call it in the failure message
 * @returns The schema
 */
export function schemaOf(
  value: SchemaObject | ReferenceObject | undefined,
  name = "the value",
): SchemaObject {
  if (value === undefined) {
    throw new Error(`This test needs ${name} to be a schema, and there is nothing there.`);
  }
  if (value.$ref !== undefined) {
    throw new Error(`This test needs ${name} to be a schema, but the emitter wrote a reference.`);
  }
  return value;
}

/**
 * The properties of a schema the test needs to have some.
 *
 * `properties` is optional, because a schema need not describe any. A test
 * reading one has decided it should, so a missing `properties` is a failure
 * here rather than an `undefined` two members further along.
 *
 * @param schema - The schema to read
 * @param name - What to call it in the failure message
 * @returns The properties, keyed by name
 */
export function propertiesOf(
  schema: SchemaObject,
  name = "the schema",
): Record<string, SchemaObject | ReferenceObject> {
  if (schema.properties === undefined) {
    throw new Error(`This test needs ${name} to describe properties, and it describes none.`);
  }
  return schema.properties;
}

/** The info object of the document. */
export function infoOf(doc: AsyncAPIDocument | null): InfoObject {
  return section(doc, (d) => d.info, "info");
}

/** The servers of the document, keyed by server name. */
export function serversOf(doc: AsyncAPIDocument | null): Record<string, ServerObject> {
  return section(doc, (d) => d.servers, "servers");
}

/** The operations of the document, keyed by operation id. */
export function operationsOf(doc: AsyncAPIDocument | null): Record<string, OperationObject> {
  return section(doc, (d) => d.operations, "operations");
}

/** The channels of the document, keyed by channel id. */
export function channelsOf(doc: AsyncAPIDocument | null): Record<string, ChannelObject> {
  return section(doc, (d) => d.channels, "channels");
}

/** The components object of the document. */
export function componentsOf(doc: AsyncAPIDocument | null): ComponentsObject {
  return section(doc, (d) => d.components, "components");
}

/** The reusable messages, keyed by message name. */
export function messagesOf(doc: AsyncAPIDocument | null): Record<string, MessageObject> {
  return section(doc, (d) => componentsOf(d).messages, "components.messages");
}

/** The reusable schemas, keyed by schema name. */
export function schemasOf(doc: AsyncAPIDocument | null): Record<string, SchemaObject> {
  return section(doc, (d) => componentsOf(d).schemas, "components.schemas");
}

/** The reusable security schemes, keyed by scheme name. */
export function securitySchemesOf(
  doc: AsyncAPIDocument | null,
): Record<string, SecuritySchemeObject> {
  return section(doc, (d) => componentsOf(d).securitySchemes, "components.securitySchemes");
}

/**
 * Collects every `$ref` string anywhere in a document.
 *
 * The walk is untyped on purpose. A `$ref` can sit at any depth, inside a
 * schema, a message, a channel, or an array of any of them, and the document
 * types state each of those positions separately. A reader that followed the
 * types would need one branch per position and would miss the next one added.
 *
 * @param node - Any part of an emitted document
 * @param found - The accumulator, for the recursive calls
 * @returns Every `$ref` value the subtree holds, in walk order
 */
export function collectRefs(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, found);
    return found;
  }
  if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") found.push(value);
      else collectRefs(value, found);
    }
  }
  return found;
}
