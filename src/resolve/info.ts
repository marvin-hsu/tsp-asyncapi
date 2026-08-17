/**
 * The resolve half of the `info` object.
 *
 * It reads the service, the `@info` decorator, and the two decorators that
 * reach `info` from the service namespace: `@asyncTag` and `@externalDocs`.
 */

import { Namespace, Program, Service, getDoc } from "@typespec/compiler";
import { getInfo } from "../decorators/index.js";
import { buildTags } from "./tags.js";
import { buildExternalDocs } from "../external-docs.js";
import { DEFAULT_DOCUMENT_TITLE, DEFAULT_INFO_VERSION } from "../constants.js";
import { InfoNode } from "./service.js";

/**
 * Resolves the `info` object of one service.
 *
 * `@service`'s own title is the default, and `@info` overrides every field it
 * carries. `@doc` fills the description only when `@info` gave none, because
 * the more specific decorator wins.
 *
 * The node's fields are fixed, so the emitted order is the order of the Info
 * Object table in the specification. The previous builder merged the `@info`
 * value with `Object.assign`, which made the emitted order follow the order
 * the author happened to write inside `#{ ... }`. Two documents describing
 * one service would then differ by how their author typed a literal.
 *
 * @param program - The program the service belongs to
 * @param service - The service the document describes
 * @returns The resolved `info`
 * @internal
 */
export function resolveInfo(program: Program, service: Service | undefined): InfoNode {
  if (service === undefined) {
    // A program with no `@service` still emits a document, so `info` still
    // needs its two required fields.
    return { title: DEFAULT_DOCUMENT_TITLE, version: DEFAULT_INFO_VERSION, tags: [] };
  }
  const target: Namespace = service.type;
  const custom = getInfo(program, target);

  return {
    target,
    // `@info` carries no title. The title comes from `@service`, which is
    // the decorator that names the application.
    title: service.title ?? DEFAULT_DOCUMENT_TITLE,
    version: custom?.version ?? DEFAULT_INFO_VERSION,
    ...optional("description", custom?.description ?? getDoc(program, target)),
    ...optional("termsOfService", custom?.termsOfService),
    ...optional("contact", custom?.contact),
    ...optional("license", custom?.license),
    tags: buildTags(program, target) ?? [],
    ...optional("externalDocs", buildExternalDocs(program, target)),
  };
}

/** Includes a field only when it is defined. */
function optional<K extends string, V>(
  name: K,
  value: V | undefined,
): Record<K, V> | Record<string, never> {
  return value !== undefined ? ({ [name]: value } as Record<K, V>) : {};
}
