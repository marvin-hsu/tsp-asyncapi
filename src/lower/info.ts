/**
 * The lower half of the `info` object.
 *
 * It copies the resolved node into the Info Object. The copy matters: the
 * node holds the contact and the license as they were recorded, and the
 * document must not alias state the emitter does not own.
 */

import type { InfoNode } from "../resolve/service.js";
import { present, text } from "../optional-fields.js";
import { InfoObject } from "../types.js";

/**
 * Builds the Info Object from its resolved node.
 *
 * The field order follows the Info Object table of the specification.
 *
 * @param node - The resolved `info`
 * @returns The Info Object
 * @internal
 */
export function lowerInfo(node: InfoNode): InfoObject {
  return {
    title: node.title,
    version: node.version,
    ...text("description", node.description),
    ...text("termsOfService", node.termsOfService),
    ...present("contact", node.contact ? { ...node.contact } : undefined),
    ...present("license", node.license ? { ...node.license } : undefined),
    ...present("tags", node.tags.length > 0 ? structuredClone([...node.tags]) : undefined),
    ...present("externalDocs", node.externalDocs ? { ...node.externalDocs } : undefined),
  };
}
