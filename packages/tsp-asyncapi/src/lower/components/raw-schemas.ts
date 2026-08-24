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
 * ## Why the key is claimed rather than checked
 *
 * The key comes from the message that carried the schema first, so it can
 * collide with a key a model wants for itself. The survey runs before any
 * model is walked, so asking who owns a key at this point always answers
 * "nobody": the check has to be a claim.
 *
 * `claimDerived` is the same call the lifted-payload path makes, and it puts
 * this key under the one collision rule every other key follows. A key
 * another claim already holds leaves the schema inline, and a model that
 * later wants the same name is reported rather than quietly replacing it.
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
      // The claim is made on behalf of the message the key was derived from,
      // so a later collision names that message rather than sending the
      // author to look for a second declaration.
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
