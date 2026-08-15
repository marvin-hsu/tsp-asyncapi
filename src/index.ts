/**
 * The public API of this package.
 *
 * Every name here is listed on purpose. An `export *` would publish
 * whatever a module happens to export, which already caught this project
 * once: a state helper meant for one builder became part of the package's
 * runtime surface because it sat in a re-exported file. An `@internal` tag
 * does not prevent that, since it only affects the API report.
 *
 * The decorator implementations are not here. `src/tsp-index.ts` hands
 * those to the compiler.
 */

export { $onEmit } from "./emitter.js";

export {
  $lib,
  createDiagnostic,
  reportDiagnostic,
  LIBRARY_NAME,
  type AsyncAPIEmitterOptions,
} from "./lib.js";

export type {
  AsyncAPIDocument,
  ChannelObject,
  ComponentsObject,
  ContactObject,
  ExternalDocumentationObject,
  InfoObject,
  LicenseObject,
  MessageObject,
  OperationObject,
  ReferenceObject,
  SchemaObject,
  ServerObject,
  TagObject,
} from "./types/index.js";

// Readers for the state the decorators record. A tool built on top of this
// emitter uses these; applying a decorator is the compiler's job.
export {
  getExternalDocs,
  getInfo,
  getJsonSchemaExtensions,
  getServers,
  isOneOf,
  listMessages,
  type AsyncAPIInfoState,
  type AsyncAPIServerState,
  type ExternalDocsState,
  type JsonSchemaExtensionRecord,
  type MessageState,
} from "./decorators/index.js";
