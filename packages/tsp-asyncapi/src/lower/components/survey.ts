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
import { lowerBindings } from "../bindings.js";
import type {
  BindingsObject,
  CorrelationIdObject,
  ExternalDocumentationObject,
  ReferenceObject,
  TagObject,
} from "../../types/index.js";

import { componentRef } from "../json-pointer.js";
import { Promoter } from "./promotion.js";
import type { ClaimedSchemaKeys } from "./raw-schemas.js";
import { RawSchemaPromoter } from "./raw-schemas.js";

/**
 * The character set every `components.*` map states in its
 * `patternProperties`. A key outside it is not rejected, because no map sets
 * `additionalProperties: false` — it simply matches no pattern and goes
 * unvalidated, which makes a bad key invisible to a validator rather than
 * loud. So keys are cleaned here instead of being left to the parser.
 */
const KEY_CHARACTERS = /[^\w.-]/g;

/** Cleans one site name into a key every `components` map states it accepts. */
function keyFromSite(site: string): string {
  const cleaned = site.replace(KEY_CHARACTERS, "_");
  // A site name is derived from something the author wrote, so it is empty
  // only if every character of it was outside the set.
  return cleaned.length > 0 ? cleaned : "_";
}

/** Every promotion one document drives, each survey already closed. */
export interface DocumentPromotions {
  readonly rawSchemas: RawSchemaPromoter;
  readonly correlationIds: Promoter<CorrelationIdObject>;
  readonly externalDocs: Promoter<ExternalDocumentationObject>;
  readonly tags: Promoter<TagObject>;
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
    // decorator. Rendering is a pure function of the nodes, so surveying
    // costs one extra render per site and changes nothing.
    const rendered = lowerBindings(nodes);
    if (rendered !== undefined) bindings[section].survey(rendered, site);
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
    surveyBindings("serverBindings", server.bindings, server.name);
  }
  for (const channel of service.channels) {
    surveySite(channel.key, channel);
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
  for (const promoter of Object.values(bindings)) promoter.freeze();

  return {
    rawSchemas: RawSchemaPromoter.survey(service, schemas),
    correlationIds,
    externalDocs,
    tags,
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
 * @returns The reference, the copy, or `undefined` when the site has nothing
 * @internal
 */
export function shared<T>(
  promoter: Promoter<T>,
  section: string,
  value: T | undefined,
): T | ReferenceObject | undefined {
  if (value === undefined) return undefined;
  const key = promoter.keyFor(value);
  return key === undefined ? structuredClone(value) : { $ref: componentRef(section, key) };
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
  // Every entry went through the survey, so `shared` never answers
  // `undefined` here.
  return values.map((value) => shared(promoter, section, value) as T | ReferenceObject);
}
