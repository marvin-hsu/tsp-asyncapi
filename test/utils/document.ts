import type {
  AsyncAPIDocument,
  ChannelObject,
  BindingObject,
  BindingsObject,
  ComponentsObject,
  ExternalDocumentationObject,
  TagObject,
  InfoObject,
  ReferenceObject,
  MessageObject,
  MultiFormatSchemaObject,
  OperationObject,
  SchemaObject,
  ParameterObject,
  SecuritySchemeObject,
  ServerVariableObject,
  ServerObject,
} from "#emitter/types/index.js";

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
  value: SchemaObject | MultiFormatSchemaObject | ReferenceObject | undefined,
  name = "the value",
): SchemaObject {
  if (value === undefined) {
    throw new Error(`This test needs ${name} to be a schema, and there is nothing there.`);
  }
  if ("$ref" in value && value.$ref !== undefined) {
    throw new Error(`This test needs ${name} to be a schema, but the emitter wrote a reference.`);
  }
  // `components.schemas` also holds a schema written in another language,
  // such as Avro or Protobuf. That one carries no JSON Schema keyword. So a
  // test that reads `properties` from it has the wrong entry, and the name of
  // the format says which one it got.
  if ("schemaFormat" in value) {
    throw new Error(
      `This test needs ${name} to be a JSON Schema, but the emitter wrote one in ${value.schemaFormat}.`,
    );
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

/**
 * The reusable schemas, keyed by schema name.
 *
 * The map holds what `components.schemas` holds. That is a JSON Schema, or a
 * schema written in another language such as Avro or Protobuf.
 *
 * A test that reads the key set uses this reader alone. A test that reads a
 * JSON Schema keyword narrows one entry with `schemaOf` first. That way the
 * failure lands on the entry the test asked about, not on the whole map.
 */
export function schemasOf(
  doc: AsyncAPIDocument | null,
): Record<string, SchemaObject | MultiFormatSchemaObject> {
  return section(doc, (d) => componentsOf(d).schemas, "components.schemas");
}

/** The reusable security schemes, keyed by scheme name. */
export function securitySchemesOf(
  doc: AsyncAPIDocument | null,
): Record<string, SecuritySchemeObject> {
  return section(doc, (d) => componentsOf(d).securitySchemes, "components.securitySchemes");
}

/**
 * Counts how many times `key` appears as an object key anywhere in a document.
 *
 * A shape the emitter copied rather than referenced shows up as a repeated
 * key. So a property name only one declaration uses is a marker for that
 * declaration's body, and its count is the number of copies emitted.
 *
 * Only keys are counted. A name that appears as a string inside `required` is
 * a value, not a key, and does not add to the count.
 *
 * @param node - Any part of an emitted document
 * @param key - The object key to count
 * @returns The number of occurrences
 */
export function countKey(node: unknown, key: string): number {
  if (Array.isArray(node)) {
    return node.reduce<number>((total, item) => total + countKey(item, key), 0);
  }
  if (node === null || typeof node !== "object") return 0;
  let total = 0;
  for (const [candidate, value] of Object.entries(node)) {
    if (candidate === key) total++;
    total += countKey(value, key);
  }
  return total;
}

/**
 * The external documentation of a value the test expects to be inline.
 *
 * A shared link is written as a reference into `components.externalDocs`, so
 * a test that reads `url` has to say which arm it needs.
 *
 * @param value - An External Documentation Object or a reference
 * @param name - What to call it in the failure message
 * @returns The External Documentation Object
 */
export function externalDocsOf(
  value: ExternalDocumentationObject | ReferenceObject | undefined,
  name = "the value",
): ExternalDocumentationObject {
  if (value === undefined) {
    throw new Error(
      `This test needs ${name} to be external documentation, and there is nothing there.`,
    );
  }
  if ("$ref" in value) {
    throw new Error(
      `This test needs ${name} to be external documentation, but the emitter wrote a reference.`,
    );
  }
  return value;
}

/**
 * The Tag Objects one site carries, with every reference followed.
 *
 * A tag carries the name its author wrote, so it is always shared through
 * `components.tags` and every site writes a reference. A test about what a
 * tag says — how two applications of `@asyncTag` merge, which fields survive
 * — is not about where the tag is written, so it reads through this.
 * `test/unit/package-asyncapi/lower/tag-promotion.test.ts` is where the
 * placement itself is pinned.
 *
 * @param doc - The emitted document
 * @param tags - The list one site carries
 * @returns The Tag Objects, in the order the site lists them
 */
export function resolveTags(
  doc: AsyncAPIDocument | null,
  tags: readonly (TagObject | ReferenceObject)[] | undefined,
): TagObject[] {
  const components = doc?.components?.tags ?? {};
  return (tags ?? []).map((tag) => {
    if (!("$ref" in tag)) return tag;
    const key = tag.$ref.replace("#/components/tags/", "");
    if (!Object.hasOwn(components, key)) {
      throw new Error(`The document references '${tag.$ref}', and nothing is there.`);
    }
    return components[key];
  });
}

/**
 * The Bindings Object one site carries, when the test expects it inline.
 *
 * A Bindings Object has no name of its own, so it is shared only when more
 * than one site carries the same one. A test about what a binding *says* has
 * one site, so it reads through this. A test about sharing asserts the
 * reference itself.
 *
 * @param value - A Bindings Object or a reference
 * @param name - What to call it in the failure message
 * @returns The Bindings Object
 */
export function bindingsOf(
  value: BindingsObject | ReferenceObject | undefined,
  name = "the value",
): BindingsObject {
  if (value === undefined) {
    throw new Error(`This test needs ${name} to be bindings, and there is nothing there.`);
  }
  if ("$ref" in value) {
    throw new Error(
      `This test needs ${name} to be bindings, but the emitter shared them through a reference.`,
    );
  }
  return value;
}

/**
 * One protocol's binding, or `undefined` when the site carries none.
 *
 * The document type says a binding is an untyped record, because a binding
 * is whatever its protocol says. A test that reads named fields names the
 * shape at the call site.
 *
 * @param value - A Bindings Object or a reference
 * @param protocol - The protocol name the binding is keyed under
 * @returns The binding, or `undefined`
 */
export function bindingFor(
  value: BindingsObject | ReferenceObject | undefined,
  protocol: string,
): BindingObject | undefined {
  const bindings = bindingsOf(value, `the ${protocol} bindings`);
  return Object.hasOwn(bindings, protocol) ? bindings[protocol] : undefined;
}

/**
 * Follows every reference in one map of shared fragments.
 *
 * A Parameter Object and a Server Variable Object are named by the key of
 * the map they sit in, so each is written once in `components` and every map
 * points at it. A test about what one *says* is not about where it is
 * written, so it reads through this.
 */
function resolveMap<T extends object>(
  section: Record<string, T> | undefined,
  entries: Record<string, T | ReferenceObject> | undefined,
  prefix: string,
): Record<string, T> {
  const components = section ?? {};
  const resolved: Record<string, T> = {};
  for (const [name, value] of Object.entries(entries ?? {})) {
    if (!("$ref" in value)) {
      resolved[name] = value;
      continue;
    }
    const key = value.$ref.replace(prefix, "");
    if (!Object.hasOwn(components, key)) {
      throw new Error(`The document references '${value.$ref}', and nothing is there.`);
    }
    resolved[name] = components[key];
  }
  return resolved;
}

/**
 * The channel parameters of one channel, with every reference followed.
 *
 * @param doc - The emitted document
 * @param parameters - The `parameters` map of one channel
 * @returns The Parameter Objects, keyed as the channel keys them
 */
export function resolveParameters(
  doc: AsyncAPIDocument | null,
  parameters: Record<string, ParameterObject | ReferenceObject> | undefined,
): Record<string, ParameterObject> {
  return resolveMap(doc?.components?.parameters, parameters, "#/components/parameters/");
}

/**
 * The variables of one server, with every reference followed.
 *
 * @param doc - The emitted document
 * @param variables - The `variables` map of one server
 * @returns The Server Variable Objects, keyed as the server keys them
 */
export function resolveServerVariables(
  doc: AsyncAPIDocument | null,
  variables: Record<string, ServerVariableObject | ReferenceObject> | undefined,
): Record<string, ServerVariableObject> {
  return resolveMap(doc?.components?.serverVariables, variables, "#/components/serverVariables/");
}

/**
 * The external documentation one site carries, with a reference followed.
 *
 * The counterpart of {@link resolveTags} for a field that holds one
 * fragment rather than a list.
 *
 * @param doc - The emitted document
 * @param value - The `externalDocs` of one site
 * @returns The External Documentation Object, or `undefined` when the site
 * carries none
 */
export function resolveExternalDocs(
  doc: AsyncAPIDocument | null,
  value: ExternalDocumentationObject | ReferenceObject | undefined,
): ExternalDocumentationObject | undefined {
  if (value === undefined) return undefined;
  if (!("$ref" in value)) return value;
  const components = doc?.components?.externalDocs ?? {};
  const key = value.$ref.replace("#/components/externalDocs/", "");
  if (!Object.hasOwn(components, key)) {
    throw new Error(`The document references '${value.$ref}', and nothing is there.`);
  }
  return components[key];
}
