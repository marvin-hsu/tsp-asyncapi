/**
 * The lower half of the `components` section.
 *
 * `components` holds what more than one place in the document can point at.
 * Today that is the schemas a message payload reaches, the messages
 * themselves, and the security schemes. Later steps add the other fields the
 * specification defines, so the section gets a file of its own rather than
 * growing inside `document.ts`.
 *
 * This file does not build a schema itself. It only assembles what
 * `SchemaBuilder` and the promoters in `lower/components/` hand back.
 *
 * The order the fields are written here is the order a reader sees, and it
 * follows the order the specification lists them. TypeScript does not make an
 * object literal follow its interface, so the two agree because they were
 * written to agree. `test/unit/package-asyncapi/lower/components-shape.test.ts`
 * pins that against an emitted document.
 */

import { Program } from "@typespec/compiler";
import { ComponentsObject, MultiFormatSchemaObject, SchemaObject } from "../types/index.js";
import type { AsyncAPIService } from "tsp-asyncapi-core/unstable";
import { SchemaBuilder } from "./schemas.js";
import { lowerMessages, reportShadowedSchemaKeys } from "./messages.js";
import { lowerSecuritySchemes } from "./security-schemes.js";
import type { DocumentPromotions } from "./components/survey.js";

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
 * @param promoted - The closed surveys, holding every shared fragment
 * @returns The section, or `undefined` when nothing reached it
 * @internal
 */
export function lowerComponents(
  program: Program,
  service: AsyncAPIService,
  schemaBuilder: SchemaBuilder,
  promoted: DocumentPromotions,
): ComponentsObject | undefined {
  const messages = lowerMessages(schemaBuilder, promoted, service.messages);
  // The shadow check reads the schema key owners, so it runs once every key
  // is claimed. A discriminated subtype claims its own only when the pending
  // queue drains, which this call does first.
  reportShadowedSchemaKeys(program, schemaBuilder, service.messages);
  // The built schemas first, then the shared raw ones. A raw schema is not
  // built from a model, so the builder never held it.
  const schemas: Record<string, SchemaObject | MultiFormatSchemaObject> = {
    ...schemaBuilder.getSchemas(),
    ...Object.fromEntries(promoted.rawSchemas.entries()),
  };
  const securitySchemes = lowerSecuritySchemes(service.securitySchemes);
  const correlationIds = Object.fromEntries(promoted.correlationIds.entries());
  const externalDocs = Object.fromEntries(promoted.externalDocs.entries());
  const tags = Object.fromEntries(promoted.tags.entries());
  const parameters = Object.fromEntries(promoted.parameters.entries());
  const serverVariables = Object.fromEntries(promoted.serverVariables.entries());
  const bindings = {
    serverBindings: Object.fromEntries(promoted.serverBindings.entries()),
    channelBindings: Object.fromEntries(promoted.channelBindings.entries()),
    operationBindings: Object.fromEntries(promoted.operationBindings.entries()),
    messageBindings: Object.fromEntries(promoted.messageBindings.entries()),
  };
  const filledBindings = Object.fromEntries(
    Object.entries(bindings).filter(([, section]) => Object.keys(section).length > 0),
  );

  const components: ComponentsObject = {
    ...(Object.keys(schemas).length > 0 ? { schemas } : {}),
    ...(Object.keys(serverVariables).length > 0 ? { serverVariables } : {}),
    ...(messages ? { messages } : {}),
    ...(securitySchemes ? { securitySchemes } : {}),
    ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
    ...(Object.keys(correlationIds).length > 0 ? { correlationIds } : {}),
    ...filledBindings,
    ...(Object.keys(tags).length > 0 ? { tags } : {}),
    ...(Object.keys(externalDocs).length > 0 ? { externalDocs } : {}),
  };
  return Object.keys(components).length > 0 ? components : undefined;
}
