/**
 * The decorators this library declares, one module each.
 *
 * The file is a re-export list on purpose. `src/index.ts` names what the
 * package publishes, and `src/tsp-index.ts` names what the compiler binds,
 * so nothing here reaches either surface by accident.
 */

/** @public */
export const namespace = "AsyncAPI";

export { $info, getInfo, type AsyncAPIInfoState } from "./info.js";
export { $server, getServers, type AsyncAPIServerState } from "./server.js";
export { $externalDocs, getExternalDocs, type ExternalDocsState } from "./external-docs.js";
export { $oneOf, isOneOf } from "./one-of.js";
export {
  $jsonSchemaExtension,
  getJsonSchemaExtensions,
  type JsonSchemaExtensionRecord,
} from "./json-schema-extension.js";
export { $message, listMessages, type MessageState } from "./message.js";
