/**
 * Sharing a schema written in another language.
 *
 * `@rawPayload` and `@rawHeaders` carry a schema the author wrote, in a
 * format the author named: Avro, Protobuf, or anything else AsyncAPI lists.
 * This emitter never reads inside one; this file only shares one when two
 * messages carry the same text, instead of writing it twice. Sharing pays
 * off most for `@typespec/protobuf`, which writes one `.proto` file per
 * package and repeats it verbatim on every message that uses that package.
 *
 * A raw schema has no name of its own, so it promotes only on a second use,
 * the `"repeated"` policy from `./promotion.ts`. Payloads and headers survey
 * separately, so a message carrying identical text in both keeps both
 * copies in place; the saving this file targets is one schema reaching
 * several messages, not one message reaching itself twice.
 *
 * The key comes from the message that carried the schema first, so it can
 * collide with a key a model wants. The survey runs before any model is
 * walked, so it cannot check who owns a key yet; it can only claim one.
 * `claimDerived` puts this claim under the same collision rule every other
 * key follows: a key another claim already holds leaves the schema inline,
 * and a model that later wants the same name is reported rather than
 * silently overridden.
 */

import type { Model } from "@typespec/compiler";
import type { AsyncAPIService } from "tsp-asyncapi-core/unstable";
import type { MultiFormatSchemaObject } from "../../types/index.js";
/**
 * The one thing a survey asks of the schema key registry.
 *
 * `SchemaBuilder` answers it. Naming the question rather than the builder is
 * what lets a test survey a document without compiling one.
 */
export interface ClaimedSchemaKeys {
  claimDerived(key: string, target: Model): boolean;
}
import { Promoter } from "./promotion.js";

/** The suffix each kind of raw schema takes on its component key. */
const SUFFIX = { payload: "Payload", headers: "Headers" } as const;

/**
 * The raw schemas of one document that earn a place in `components.schemas`.
 *
 * Built before the messages are lowered, because a message needs to know
 * whether to write a reference or the schema itself.
 */
export class RawSchemaPromoter {
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
  public static survey(
    service: Pick<AsyncAPIService, "messages">,
    schemas: ClaimedSchemaKeys,
  ): RawSchemaPromoter {
    const make = () =>
      new Promoter<MultiFormatSchemaObject>({ when: "repeated", key: (_value, site) => site });
    const payloads = make();
    const headers = make();
    // The message each key was derived from, so the claim below can name it.
    const owners = new Map<string, Model>();
    for (const message of service.messages) {
      if (message.payload.kind === "raw") {
        const key = message.key + SUFFIX.payload;
        payloads.survey(message.payload.schema, key);
        owners.set(key, message.target);
      }
      if (message.headers.kind === "raw") {
        const key = message.key + SUFFIX.headers;
        headers.survey(message.headers.schema, key);
        owners.set(key, message.target);
      }
    }
    payloads.freeze();
    headers.freeze();

    const promoted = new RawSchemaPromoter(payloads, headers);
    for (const [key, schema] of [...payloads.entries(), ...headers.entries()]) {
      // Claimed on behalf of the message the key came from, so a later
      // collision names that message instead of sending the author hunting
      // for a second declaration.
      const target = owners.get(key);
      if (target === undefined || !schemas.claimDerived(key, target)) continue;
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
