/**
 * The lower half of one channel's address parameters.
 *
 * A Parameter Object carries no name of its own: the author wrote it as the
 * key of the `parameters` map. So the key is the name, and a parameter is
 * shared through `components.parameters` on its first use. A set of
 * channels addressing one `{userId}` shares that parameter this way, and
 * that is the ordinary shape of an event API.
 *
 * Only the builder lives here, not the map. The survey in
 * `components/survey.ts` takes a fragment's identity from the lowered
 * object, so it needs this function before anything is written, while the
 * map needs the survey's answer. Splitting them is what keeps
 * `channels.ts` and `survey.ts` from importing each other.
 */

import type { ChannelParameterNode } from "tsp-asyncapi-core/unstable";
import { present, text } from "tsp-asyncapi-core";
import type { ParameterObject } from "../../types/index.js";

/**
 * Turns one resolved parameter into a Parameter Object.
 *
 * @param node - The resolved parameter
 * @returns The Parameter Object
 * @internal
 */
export function lowerParameter(node: ChannelParameterNode): ParameterObject {
  return {
    ...present("enum", node.enumValues ? [...node.enumValues] : undefined),
    ...text("default", node.default),
    ...text("description", node.description),
    ...present("examples", node.examples ? [...node.examples] : undefined),
    ...text("location", node.location),
  };
}
