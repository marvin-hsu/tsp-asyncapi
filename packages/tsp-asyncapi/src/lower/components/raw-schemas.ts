/**
 * Sharing a schema that is written in another language.
 *
 * `@rawPayload` and `@rawHeaders` carry a schema the author wrote, in a
 * format the author named: Avro, Protobuf, or anything else AsyncAPI lists.
 * The emitter never reads inside one. Until now it also never shared one, so
 * two messages carrying the same Protobuf definition wrote it twice.
 *
 * That is about to matter more than it does today. `@typespec/protobuf`
 * writes one `.proto` per package, holding every message in that package. A
 * document whose payloads come from one package would repeat the whole
 * package text once per message.
 *
 * ## Why the second use decides
 *
 * A raw schema has no name of its own. The author wrote the text, not a
 * label for it, so nothing here can promote on a name the way a tag does.
 * The second use is the evidence that a component saves anything, and a
 * schema used once stays where it is rather than gaining a `$ref` hop.
 *
 * ## Why the two slots do not share with each other
 *
 * A payload and a headers block are surveyed separately, so a message that
 * carries the same text in both keeps both in place. Sharing them would give
 * `headers` a reference to a component named after a payload, and the saving
 * is one copy inside one message. The case this file exists for is the same
 * schema reaching several messages.
 *
 * ## Why a claimed key means no promotion
 *
 * The key comes from the message that carried the schema first, so it can
 * collide with a key the schema builder already claimed for a model. When it
 * does, this leaves the schema inline. The document is still correct, it just
 * repeats the text, which is what it did before this file existed. Reporting
 * a diagnostic would ask the author to rename something to enable an
 * optimisation they never asked for.
 */

import type { AsyncAPIService } from "tsp-asyncapi-core/unstable";
import type { CorrelationIdObject, MultiFormatSchemaObject } from "../../types/index.js";
import type { SchemaBuilder } from "../schemas.js";
import { Promoter } from "./promotion.js";

/** The suffix each kind of raw schema takes on its component key. */
const SUFFIX = { payload: "Payload", headers: "Headers" } as const;

/**
 * The raw schemas of one document that earn a place in `components.schemas`.
 *
 * Built before the messages are lowered, because a message needs to know
 * whether to write a reference or the schema itself.
 */
class RawSchemaPromoter {
  readonly #payloads: Promoter<MultiFormatSchemaObject>;
  readonly #headers: Promoter<MultiFormatSchemaObject>;
  readonly #keys = new Map<string, MultiFormatSchemaObject>();

  private constructor(
    payloads: Promoter<MultiFormatSchemaObject>,
    headers: Promoter<MultiFormatSchemaObject>,
  ) {
    this.#payloads = payloads;
    this.#headers = headers;
  }

  /**
   * Surveys every message and closes the survey.
   *
   * @param service - The semantic model
   * @param schemas - The builder, asked whether a key is already claimed
   * @returns A promoter ready to answer for each site
   * @internal
   */
  public static survey(service: AsyncAPIService, schemas: SchemaBuilder): RawSchemaPromoter {
    const make = () =>
      new Promoter<MultiFormatSchemaObject>({ when: "repeated", key: (_value, site) => site });
    const payloads = make();
    const headers = make();
    for (const message of service.messages) {
      if (message.payload.kind === "raw") {
        payloads.survey(message.payload.schema, message.key + SUFFIX.payload);
      }
      if (message.headers.kind === "raw") {
        headers.survey(message.headers.schema, message.key + SUFFIX.headers);
      }
    }
    payloads.freeze();
    headers.freeze();

    const promoted = new RawSchemaPromoter(payloads, headers);
    for (const [key, schema] of [...payloads.entries(), ...headers.entries()]) {
      // A key the schema builder owns belongs to a model. Leaving this one
      // inline is the safe answer, and it is what the emitter did before.
      if (schemas.schemaKeyOwner(key) !== undefined) continue;
      promoted.#keys.set(key, schema);
    }
    return promoted;
  }

  /**
   * The component key for one raw schema, or `undefined` when the message
   * writes the schema itself.
   *
   * @param schema - The schema the message carries
   * @returns The key, or `undefined` when this schema stays in place
   */
  public keyFor(slot: "payload" | "headers", schema: MultiFormatSchemaObject): string | undefined {
    const key = (slot === "payload" ? this.#payloads : this.#headers).keyFor(schema);
    if (key === undefined) return undefined;
    return this.#keys.has(key) ? key : undefined;
  }

  /** The promoted schemas, keyed as they will be emitted, in survey order. */
  public entries(): ReadonlyMap<string, MultiFormatSchemaObject> {
    return this.#keys;
  }
}

/**
 * Every promotion a message drives, surveyed together.
 *
 * A message carries several fragments that can be shared, and each needs the
 * survey closed before the message is lowered. One bag keeps the lowering
 * signature from growing a parameter per kind.
 */
export interface MessagePromotions {
  readonly rawSchemas: RawSchemaPromoter;
  readonly correlationIds: Promoter<CorrelationIdObject>;
}

/**
 * Surveys every fragment a message can share.
 *
 * @param service - The semantic model
 * @param schemas - The builder, asked whether a schema key is already claimed
 * @returns The promotions, with every survey closed
 * @internal
 */
export function surveyMessages(
  service: AsyncAPIService,
  schemas: SchemaBuilder,
): MessagePromotions {
  const correlationIds = new Promoter<CorrelationIdObject>({
    when: "repeated",
    key: (_value, site) => site,
  });
  for (const message of service.messages) {
    if (message.correlationId !== undefined) {
      correlationIds.survey(message.correlationId, message.key);
    }
  }
  correlationIds.freeze();

  return { rawSchemas: RawSchemaPromoter.survey(service, schemas), correlationIds };
}
