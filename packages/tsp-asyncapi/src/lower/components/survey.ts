/**
 * One survey of the whole document, run before a byte is written.
 *
 * A fragment can only be shared if every site that carries it is known
 * before the first one is written. The resolved model holds every server,
 * channel, operation and message up front, so this walks it once, counts
 * what it meets, and closes. `lowerDocument` then writes each site knowing
 * whether it emits a reference or the fragment itself.
 *
 * ## Why the walk order is the write order
 *
 * The survey visits `info`, then the servers, channels, operations and
 * messages, which is the order the document lists them. A key comes from the
 * first site to carry a fragment, and each promoter keeps its entries in
 * survey order, so a `components` section comes out in source order without a
 * sort of its own. Reordering this walk reorders the emitted keys.
 */

import type { AsyncAPIService, BindingNode } from "tsp-asyncapi-core/unstable";
import { BindingsRenderer } from "../bindings.js";
import { lowerParameter } from "../channels/parameters.js";
import { lowerServerVariable } from "../servers/variables.js";
import type {
  BindingsObject,
  CorrelationIdObject,
  ExternalDocumentationObject,
  ParameterObject,
  ReferenceObject,
  ServerVariableObject,
  TagObject,
} from "../../types/index.js";

import { sanitizeDeclarationName } from "tsp-asyncapi-core";
import { componentRef } from "../json-pointer.js";
import { Promoter } from "./promotion.js";
import type { ClaimedSchemaKeys } from "./raw-schemas.js";
import { RawSchemaPromoter } from "./raw-schemas.js";

/**
 * Cleans one site name into a key every `components` map states it accepts.
 *
 * `sanitizeDeclarationName` already owns this decision for
 * `components.schemas` and `components.messages`, and one document should
 * not clean its keys two ways.
 */
function keyFromSite(site: string): string {
  const cleaned = sanitizeDeclarationName(site);
  // A site name comes from something the author wrote, so it is empty only
  // if the name itself was.
  return cleaned.length > 0 ? cleaned : "Empty";
}

/** Every promotion one document drives, each survey already closed. */
export interface DocumentPromotions {
  readonly rawSchemas: RawSchemaPromoter;
  /**
   * The renderer the survey used, carried on so each site writes the object
   * the survey already rendered for it.
   */
  readonly renderedBindings: BindingsRenderer;
  readonly correlationIds: Promoter<CorrelationIdObject>;
  readonly externalDocs: Promoter<ExternalDocumentationObject>;
  readonly tags: Promoter<TagObject>;
  readonly parameters: Promoter<ParameterObject>;
  readonly serverVariables: Promoter<ServerVariableObject>;
  readonly serverBindings: Promoter<BindingsObject>;
  readonly channelBindings: Promoter<BindingsObject>;
  readonly operationBindings: Promoter<BindingsObject>;
  readonly messageBindings: Promoter<BindingsObject>;
}

/**
 * A promoter for a fragment that carries the name the author gave it.
 *
 * One use is enough, because the key is the author's own word rather than
 * the site that happened to meet it first. This is the rule
 * `plan/09-advanced.md` settled and `SchemaBuilder` has run since Phase 2.
 */
function byName<T extends { readonly name: string }>(): Promoter<T> {
  return new Promoter<T>({ when: "named", key: (value) => keyFromSite(value.name) });
}

/**
 * A promoter for a fragment whose name is the key of the map it sits in.
 *
 * A Parameter Object and a Server Variable Object carry no name of their
 * own — the author wrote it as the map key — so the site *is* the name, and
 * one use is enough.
 */
function byKey<T>(): Promoter<T> {
  return new Promoter<T>({ when: "keyed", key: (_value, site) => keyFromSite(site) });
}

/** A promoter for a fragment the author never named. */
function anonymous<T>(): Promoter<T> {
  return new Promoter<T>({ when: "repeated", key: (_value, site) => keyFromSite(site) });
}

/**
 * Walks every site of the document and closes each survey.
 *
 * @param service - The semantic model
 * @param schemas - The builder, asked whether a schema key is already claimed
 * @returns The promotions, ready to be read
 * @internal
 */
export function surveyDocument(
  service: AsyncAPIService,
  schemas: ClaimedSchemaKeys,
): DocumentPromotions {
  const correlationIds = anonymous<CorrelationIdObject>();
  const externalDocs = anonymous<ExternalDocumentationObject>();
  const tags = byName<TagObject>();
  const parameters = byKey<ParameterObject>();
  const serverVariables = byKey<ServerVariableObject>();
  const renderedBindings = new BindingsRenderer();
  const bindings = {
    serverBindings: anonymous<BindingsObject>(),
    channelBindings: anonymous<BindingsObject>(),
    operationBindings: anonymous<BindingsObject>(),
    messageBindings: anonymous<BindingsObject>(),
  };

  const surveyBindings = (
    section: keyof typeof bindings,
    nodes: readonly BindingNode[],
    site: string,
  ): void => {
    // The identity is taken from the rendered object, because
    // `bindingVersion` is appended there rather than recorded by the
    // decorator. The renderer is carried on to the sites, so each node list
    // is rendered once for the survey and the site that writes it.
    const rendered = renderedBindings.render(nodes);
    if (rendered === undefined) return;
    // The reason one Bindings Object reaches several sites is that one
    // declaration carries it, so that declaration names the component. The
    // first site names it only when the carrier is anonymous.
    bindings[section].survey(rendered, nodes[0].carrier ?? site);
  };

  const surveySite = (
    site: string,
    node: {
      readonly externalDocs?: ExternalDocumentationObject;
      readonly tags: readonly TagObject[];
    },
  ): void => {
    if (node.externalDocs !== undefined) externalDocs.survey(node.externalDocs, site);
    for (const tag of node.tags) tags.survey(tag, site);
  };

  surveySite("info", service.info);
  for (const server of service.servers) {
    surveySite(server.name, server);
    for (const [name, variable] of server.variables ?? []) {
      serverVariables.survey(lowerServerVariable(variable), name);
    }
    surveyBindings("serverBindings", server.bindings, server.name);
  }
  for (const channel of service.channels) {
    surveySite(channel.key, channel);
    for (const parameter of channel.parameters) {
      parameters.survey(lowerParameter(parameter), parameter.name);
    }
    surveyBindings("channelBindings", channel.bindings, channel.key);
  }
  for (const operation of service.operations) {
    surveySite(operation.key, operation);
    surveyBindings("operationBindings", operation.bindings, operation.key);
  }
  for (const message of service.messages) {
    surveySite(message.key, message);
    surveyBindings("messageBindings", message.bindings, message.key);
    if (message.correlationId !== undefined) {
      correlationIds.survey(message.correlationId, message.key);
    }
  }

  correlationIds.freeze();
  externalDocs.freeze();
  tags.freeze();
  parameters.freeze();
  serverVariables.freeze();
  for (const promoter of Object.values(bindings)) promoter.freeze();

  return {
    rawSchemas: RawSchemaPromoter.survey(service, schemas),
    renderedBindings,
    correlationIds,
    externalDocs,
    tags,
    parameters,
    serverVariables,
    ...bindings,
  };
}

/**
 * What one site writes for a fragment: a reference when it is shared, and a
 * copy of the fragment when it is not.
 *
 * The copy is what every site did before promotion existed, and it stays.
 * Only the shared branch hands out the object `components` holds, and it is
 * the same object every site of that fragment points at, which is the whole
 * point of sharing it.
 *
 * @param promoter - The closed survey for this kind of fragment
 * @param section - The `components` section the reference points into
 * @param value - The fragment this site carries
 * @param site - The site's own name, needed only for a fragment whose name
 * lives outside it, such as a Parameter Object
 * @returns The reference or the copy
 * @internal
 */
export function shared<T>(
  promoter: Promoter<T>,
  section: string,
  value: T,
  site?: string,
): T | ReferenceObject {
  const key = promoter.keyFor(value, site);
  return key === undefined ? structuredClone(value) : { $ref: componentRef(section, key) };
}

/**
 * {@link shared}, for a field the site may not carry at all.
 *
 * @param promoter - The closed survey for this kind of fragment
 * @param section - The `components` section the reference points into
 * @param value - The fragment this site carries, if any
 * @returns The reference, the copy, or `undefined` when the site has nothing
 * @internal
 */
export function sharedOptional<T>(
  promoter: Promoter<T>,
  section: string,
  value: T | undefined,
): T | ReferenceObject | undefined {
  return value === undefined ? undefined : shared(promoter, section, value);
}

/**
 * What one site writes for a list of fragments.
 *
 * A list is shared entry by entry rather than as a whole: two sites can
 * carry one tag in common and differ in the rest, and the specification puts
 * the reference at the entry.
 *
 * @param promoter - The closed survey for this kind of fragment
 * @param section - The `components` section the references point into
 * @param values - The fragments this site carries
 * @returns The list, or `undefined` when the site carries none
 * @internal
 */
export function sharedEach<T>(
  promoter: Promoter<T>,
  section: string,
  values: readonly T[],
): (T | ReferenceObject)[] | undefined {
  if (values.length === 0) return undefined;
  return values.map((value) => shared(promoter, section, value));
}
