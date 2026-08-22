import type {
  AsyncAPIDocument,
  ChannelObject,
  ComponentsObject,
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

function componentsOf(doc: AsyncAPIDocument | null): ComponentsObject {
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
