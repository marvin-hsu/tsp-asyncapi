/**
 * The lower half of the `info` object.
 *
 * It copies the resolved node into the Info Object. The copy matters: the
 * node holds the contact and the license as they were recorded, and the
 * document must not alias state the emitter does not own.
 */

import type { InfoNode } from "tsp-asyncapi-core/unstable";
import type { DocumentPromotions } from "./components/survey.js";
import { sharedEach, sharedOptional } from "./components/survey.js";
import { present, text } from "tsp-asyncapi-core";
import { InfoObject } from "../types/index.js";

/**
 * Builds the Info Object from its resolved node.
 *
 * The field order follows the Info Object table of the specification.
 *
 * @param node - The resolved `info`
 * @param promoted - The closed surveys, asked what each shared fragment writes
 * @returns The Info Object
 * @internal
 */
export function lowerInfo(node: InfoNode, promoted: DocumentPromotions): InfoObject {
  return {
    title: node.title,
    version: node.version,
    ...text("description", node.description),
    ...text("termsOfService", node.termsOfService),
    ...present("contact", node.contact ? { ...node.contact } : undefined),
    ...present("license", node.license ? { ...node.license } : undefined),
    ...present("tags", sharedEach(promoted.tags, "tags", node.tags)),
    ...present(
      "externalDocs",
      sharedOptional(promoted.externalDocs, "externalDocs", node.externalDocs),
    ),
    // The `x-` fields go last. They cannot collide with a specification
    // field, so their place is after every one of them.
    ...structuredClone(node.extensions),
  };
}
