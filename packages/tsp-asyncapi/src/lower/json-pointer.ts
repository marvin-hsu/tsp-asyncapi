/**
 * Every `$ref` this emitter writes, and the one it reads back.
 *
 * A `$ref` is a root and one or more escaped-key tokens. Both the writing and
 * the escaping live here, for every section of the document: schemas,
 * messages, channels, servers, and security schemes. Keeping escaping outside
 * this module risks a broken pointer from a site that never learned to do it.
 *
 * A raw schema is copied verbatim and can carry a `$ref` the user wrote, not
 * this emitter. Resolving that reference lives here too, so both directions
 * share one escaping rule.
 */

import type { ReferenceObject } from "../types/index.js";
import {
  isPlainObject,
  CHANNEL_REF_PREFIX,
  LOCAL_REF_PREFIX,
  COMPONENTS_MESSAGE_REF_PREFIX,
  COMPONENTS_SCHEMA_REF_PREFIX,
  SECURITY_SCHEME_REF_PREFIX,
  SERVER_REF_PREFIX,
} from "tsp-asyncapi-core";

/**
 * Escapes one key for use as a JSON Pointer token inside a `$ref`.
 *
 * Per RFC 6901, `~` becomes `~0` and `/` becomes `~1`. A raw `~` or `/`
 * would otherwise produce a `$ref` that every conforming resolver misreads
 * as a path through nested objects. A `components.schemas` key can hold
 * either character. A `components.messages` key holds neither today. A
 * `@useServer` name can hold both, since this emitter never checks its
 * charset.
 *
 * Only the `$ref` string needs this escaping. The key stored in the map the
 * pointer points into is left as it is. The function stays private: every
 * caller wants a whole pointer, built by a function below.
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
 * Builds the `$ref` that addresses one entry of any `components` section.
 *
 * `components.schemas` and `components.messages` have a helper of their own,
 * because their prefixes are named constants used elsewhere. Every other
 * section is addressed the same way, and a section name is a fixed word from
 * the specification rather than author text, so it needs no escaping. The key
 * does.
 *
 * @param section - The `components` section, such as `correlationIds`
 * @param key - The key the entry was emitted under
 * @returns The pointer, with the key escaped
 */
export function componentRef(section: string, key: string): string {
  return `#/components/${section}/${toJsonPointerToken(key)}`;
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

/**
 * Reads one JSON Pointer token back into the key it names.
 *
 * The escaping of `toJsonPointerToken` is undone in the reverse order. `~1`
 * becomes `/` first, then `~0` becomes `~`. The other order would turn the
 * text `~01` into `/`, which names another key.
 *
 * @param token - One segment of a pointer
 * @returns The key that segment names
 */
// Reachable only from a pointer the author wrote, never from a key this
// emitter produced. Every key it writes is sanitised first: a message key
// drops characters outside `a-zA-Z0-9.-_`, and a schema key Sep-encodes them,
// so `@message("a/b")` becomes `ASep47B`. The unescaping stays because the
// pointer is the author's text and RFC 6901 defines what it means, but no
// test can drive it through this emitter's own output.
function fromJsonPointerToken(token: string): string {
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

/**
 * The only text RFC 6901 spells an array index with.
 *
 * `Number` accepts far more than the grammar does. It reads `""` and `" "` as
 * 0, and `"01"`, `"1.0"`, `"+1"`, `"0x1"` and `"1e0"` all as 1. A pointer
 * written any of those ways would be reported as resolving here, while a
 * reader that follows the specification finds nothing at it.
 */
const ARRAY_INDEX = /^(?:0|[1-9]\d*)$/;

/**
 * Takes one step through a container the document holds.
 *
 * An array is addressed by index, and an object by key. Both are containers
 * a pointer can walk, so both are handled. Anything else ends the walk.
 *
 * @param container - The value the walk reached
 * @param token - The key or index to step through
 * @returns The value at that step, or `undefined` when there is none
 */
function stepThrough(container: unknown, token: string): unknown {
  if (Array.isArray(container)) {
    if (!ARRAY_INDEX.test(token)) {
      return undefined;
    }
    const index = Number(token);
    if (index >= container.length) {
      return undefined;
    }
    return container[index];
  }
  if (isPlainObject(container) && Object.hasOwn(container, token)) {
    return container[token];
  }
  return undefined;
}

/**
 * Walks one pointer through the document.
 *
 * @param root - The whole emitted document
 * @param pointer - The reference, starting with `#/`
 * @returns Whether the document holds a value at that location
 */
function walk(root: unknown, pointer: string): boolean {
  let current: unknown = root;
  for (const token of pointer.slice(LOCAL_REF_PREFIX.length).split("/")) {
    current = stepThrough(current, fromJsonPointerToken(token));
    if (current === undefined) {
      return false;
    }
  }
  return true;
}

/**
 * Percent-decodes a reference, or returns it as it is.
 *
 * `decodeURIComponent` throws on a stray `%`. The reference is then not
 * percent-encoded at all, so the text itself is the answer.
 *
 * @param ref - The reference as the author wrote it
 * @returns The decoded reference, or the original one
 */
function percentDecoded(ref: string): string {
  try {
    return decodeURIComponent(ref);
  } catch {
    return ref;
  }
}

/**
 * Tells whether a reference into this document reaches something.
 *
 * The emitter writes every location it refers to itself, so only a reference
 * the emitter copied verbatim can miss. A raw schema is the one source of
 * such a reference.
 *
 * The reference must start with `#/`. Every other form points outside the
 * document, and the emitter cannot decide what a registry or a file holds.
 *
 * A pointer travels in the fragment of a URI, so it can carry
 * percent-encoding. Both forms are tried, and the reference resolves when
 * either one does. This emitter never writes the encoded form, so the two
 * forms only ever differ for text the author wrote. Trying both keeps the
 * caller from reporting a document a parser accepts.
 *
 * @param root - The whole emitted document
 * @param ref - The reference, starting with `#/`
 * @returns Whether the document holds a value at that location
 */
export function resolvesInDocument(root: unknown, ref: string): boolean {
  if (!ref.startsWith(LOCAL_REF_PREFIX)) {
    return false;
  }
  if (walk(root, ref)) {
    return true;
  }
  const decoded = percentDecoded(ref);
  return decoded !== ref && decoded.startsWith(LOCAL_REF_PREFIX) && walk(root, decoded);
}

/**
 * The reference object for one `components.schemas` key.
 *
 * This lives on the emitter side because a `$ref` is a detail of the document,
 * not of what the author declared. It sits next to `componentsSchemaRef`, which
 * spells the pointer it carries.
 */
export function refFor(key: string): ReferenceObject {
  return { $ref: componentsSchemaRef(key) };
}
