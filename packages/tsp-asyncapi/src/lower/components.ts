/**
 * The lower half of the `components` section.
 *
 * `components` holds what more than one place in the document can point at.
 * Today that is the schemas a message payload reaches, the messages
 * themselves, and the security schemes. Later steps add the other fields the
 * specification defines, so the section gets a file of its own rather than
 * growing inside `document.ts`.
 *
 * The order the fields are written here is the order a reader sees, and it
 * follows the order the specification lists them. TypeScript does not make an
 * object literal follow its interface, so the two agree because they were
 * written to agree. `test/unit/package-asyncapi/lower/components-shape.test.ts`
 * pins that against an emitted document.
 */

import { Program } from "@typespec/compiler";
import { ComponentsObject } from "../types/index.js";
import type { AsyncAPIService } from "tsp-asyncapi-core/unstable";
import { SchemaBuilder } from "./schemas.js";
import { lowerMessages, reportShadowedSchemaKeys } from "./messages.js";
import { lowerSecuritySchemes } from "./security-schemes.js";

/**
 * Builds the `components` section.
 *
 * The messages are lowered first, and lowering them is what drives the schema
 * collection: the schema builder follows a payload into the models it names.
 * So only a model a message reaches gets a `components.schemas` entry.
 *
 * An empty section, or an empty entry inside it, is omitted.
 *
 * @param program - The program, needed only to report a shadowed schema key
 * @param service - The semantic model
 * @param schemaBuilder - The builder that collects the schemas
 * @returns The section, or `undefined` when nothing reached it
 * @internal
 */
export function lowerComponents(
  program: Program,
  service: AsyncAPIService,
  schemaBuilder: SchemaBuilder,
): ComponentsObject | undefined {
  const messages = lowerMessages(schemaBuilder, service.messages);
  // The shadow check reads the schema key owners, so it runs once every key
  // is claimed. A discriminated subtype claims its own only when the pending
  // queue drains, which this call does first.
  reportShadowedSchemaKeys(program, schemaBuilder, service.messages);
  const schemas = schemaBuilder.getSchemas();
  const securitySchemes = lowerSecuritySchemes(service.securitySchemes);

  const components: ComponentsObject = {
    ...(Object.keys(schemas).length > 0 ? { schemas } : {}),
    ...(messages ? { messages } : {}),
    ...(securitySchemes ? { securitySchemes } : {}),
  };
  return Object.keys(components).length > 0 ? components : undefined;
}
