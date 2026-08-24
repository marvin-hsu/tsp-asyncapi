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

import type { AsyncAPIService } from "tsp-asyncapi-core/unstable";
import type {
  CorrelationIdObject,
  ExternalDocumentationObject,
  ReferenceObject,
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

  const surveyDocs = (value: ExternalDocumentationObject | undefined, site: string): void => {
    if (value !== undefined) externalDocs.survey(value, site);
  };

  surveyDocs(service.info.externalDocs, "info");
  for (const server of service.servers) surveyDocs(server.externalDocs, server.name);
  for (const channel of service.channels) surveyDocs(channel.externalDocs, channel.key);
  for (const operation of service.operations) surveyDocs(operation.externalDocs, operation.key);
  for (const message of service.messages) {
    surveyDocs(message.externalDocs, message.key);
    if (message.correlationId !== undefined) {
      correlationIds.survey(message.correlationId, message.key);
    }
  }

  correlationIds.freeze();
  externalDocs.freeze();

  return { rawSchemas: RawSchemaPromoter.survey(service, schemas), correlationIds, externalDocs };
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
