import { Program, Type, getTags } from "@typespec/compiler";
import { TagObject } from "../types/index.js";

/**
 * Extracts standard tags from a TypeSpec type.
 */
export function buildTags(program: Program, target: Type): TagObject[] | undefined {
  const tags = getTags(program, target);
  if (tags.length > 0) {
    return tags.map((t) => ({ name: t }));
  }
  return undefined;
}
