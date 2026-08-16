/**
 * Every `$ref` this emitter writes.
 *
 * A `$ref` is a root and one or more tokens, and each token is an escaped
 * key. Both halves of that decision live here, for every section of the
 * document: schemas, messages, channels, servers, and security schemes.
 *
 * Keeping one of them outside was the mistake this module exists to prevent.
 * A layer whose key charset is relaxed later then produces a broken pointer,
 * and it produces it from the one site that never learned to escape.
 *
 * The roots themselves are constants, so a section name is written once as
 * well.
 */

import {
  CHANNEL_REF_PREFIX,
  COMPONENTS_MESSAGE_REF_PREFIX,
  COMPONENTS_SCHEMA_REF_PREFIX,
  SECURITY_SCHEME_REF_PREFIX,
  SERVER_REF_PREFIX,
} from "../constants.js";

/**
 * Escapes one key for use as a JSON Pointer token inside a `$ref`.
 *
 * Per RFC 6901, `~` becomes `~0` and `/` becomes `~1`. A raw `~` or `/`
 * would otherwise produce a `$ref` that every conforming resolver misreads
 * as a path through nested objects.
 *
 * The keys that reach this function come from three sources with three
 * different charsets. A `components.schemas` key can hold any character,
 * because a model or namespace identifier can be backquoted. A
 * `components.messages` key holds neither character today. A `@useServer`
 * name is a bare string this emitter never checks, so it can hold both.
 *
 * Only the `$ref` string needs this escaping. The key stored in the map the
 * pointer points into is left as it is.
 *
 * The function stays inside this module. Every caller wants a whole pointer,
 * and each of those is a function below. A caller that escaped a token itself
 * would decide the pointer root itself as well, which is the split this
 * module exists to prevent.
 *
 * @param key - The key to place in a pointer
 * @returns The escaped token
 */
function toJsonPointerToken(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}

/**
 * Builds the `$ref` that addresses one channel of the root `channels` map.
 *
 * @param channelId - The key the channel was emitted under
 * @returns The pointer, with the id escaped
 */
export function channelRef(channelId: string): string {
  return `${CHANNEL_REF_PREFIX}${toJsonPointerToken(channelId)}`;
}

/**
 * Builds the `$ref` that addresses one message of one channel.
 *
 * The pointer goes through the channel, never straight into
 * `components.messages`. AsyncAPI states that an operation names a message of
 * its channel, and the reference into components is the common mistake here.
 * The specification's own example carries it.
 *
 * @param channelId - The key the channel was emitted under
 * @param messageKey - The key the message was given inside that channel
 * @returns The pointer, with both tokens escaped
 */
export function channelMessageRef(channelId: string, messageKey: string): string {
  return `${channelRef(channelId)}/messages/${toJsonPointerToken(messageKey)}`;
}

/**
 * Builds the `$ref` that addresses one message of `components.messages`.
 *
 * @param messageKey - The key the message was emitted under
 * @returns The pointer, with the key escaped
 */
export function componentsMessageRef(messageKey: string): string {
  return `${COMPONENTS_MESSAGE_REF_PREFIX}${toJsonPointerToken(messageKey)}`;
}

/**
 * Builds the `$ref` that addresses one schema of `components.schemas`.
 *
 * @param schemaKey - The key the schema was emitted under
 * @returns The pointer, with the key escaped
 */
export function componentsSchemaRef(schemaKey: string): string {
  return `${COMPONENTS_SCHEMA_REF_PREFIX}${toJsonPointerToken(schemaKey)}`;
}

/**
 * Builds the `$ref` that addresses one server of the root `servers` map.
 *
 * `@useServer` takes a bare string and never checks its charset, so this is
 * the one reference site where a `~` or a `/` can really arrive.
 *
 * @param serverName - The key the server was emitted under
 * @returns The pointer, with the name escaped
 */
export function serverRef(serverName: string): string {
  return `${SERVER_REF_PREFIX}${toJsonPointerToken(serverName)}`;
}

/**
 * Builds the `$ref` that addresses one scheme of
 * `components.securitySchemes`.
 *
 * A server and an operation both name their schemes through this pointer, and
 * neither one ever writes an inline scheme.
 *
 * @param schemeName - The key the scheme was emitted under
 * @returns The pointer, with the name escaped
 */
export function securitySchemeRef(schemeName: string): string {
  return `${SECURITY_SCHEME_REF_PREFIX}${toJsonPointerToken(schemeName)}`;
}
