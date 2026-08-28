/**
 * The emitter options, and the schema the compiler validates them against.
 *
 * These belong to the emitter, not to the input language. A TypeSpec library
 * that declares decorators but emits nothing has no options at all. The set of
 * options is decided by what a target writes, so a second emitter would carry
 * a different set.
 *
 * `lib.ts` still imports the schema, because one `createTypeSpecLibrary` call
 * registers both the diagnostics and the options. That is the last place where
 * the output side reaches back into the shared definition. Splitting the
 * library into two gets rid of it, and each half then registers its own.
 */

import type { JSONSchemaType } from "@typespec/compiler";

/**
 * A feature this emitter names but does not promise to keep.
 *
 * A preview feature changes the output, so it stays off until a project asks
 * for it. The names are fixed rather than left open, so a typo in
 * `tspconfig.yaml` is a compiler error instead of a silently ignored line.
 *
 * A name is reserved before the provider behind it exists. Asking for a name
 * with no provider is reported as `preview-feature-unavailable`.
 *
 * @public
 */
export type PreviewFeature = "protobuf" | "avro";

/**
 * Every reserved preview feature name, as the option schema lists them.
 *
 * `satisfies Record<PreviewFeature, true>` requires one entry per member of
 * {@link PreviewFeature} and rejects any extra key, so the list and the type
 * stay in sync. `Object.keys` returns `string[]`. That constraint is what
 * makes the cast back to `PreviewFeature[]` safe.
 */
const PREVIEW_FEATURE_NAMES = Object.keys({
  protobuf: true,
  avro: true,
} satisfies Record<PreviewFeature, true>) as PreviewFeature[];

/**
 * Configuration options for the AsyncAPI emitter.
 *
 * @example
 * ```yaml
 * # tspconfig.yaml
 * emit:
 *   - "tsp-asyncapi"
 * options:
 *   "tsp-asyncapi":
 *     output-file: "asyncapi.yaml"
 *     file-type: "yaml"
 *     asyncapi-id: "urn:com:example:orders"
 *     default-content-type: "application/json"
 * ```
 *
 * @public
 */
export interface AsyncAPIEmitterOptions {
  /**
   * The name of the output file.
   * @defaultValue "asyncapi.yaml" or "asyncapi.json" (depending on file-type)
   */
  "output-file"?: string;

  /**
   * The format of the output file.
   * @defaultValue "yaml"
   */
  "file-type"?: "yaml" | "json";

  /**
   * The identifier of the application.
   * Maps to `id` in the AsyncAPI document.
   */
  "asyncapi-id"?: string;

  /**
   * Default content type to use when encoding/decoding a message's payload.
   * Maps to `defaultContentType` in the AsyncAPI document.
   * @example "application/json"
   */
  "default-content-type"?: string;

  /**
   * The preview features to turn on.
   *
   * A preview feature changes the emitted document, so the default is an
   * empty list and the output is unchanged without it.
   *
   * @defaultValue [] (no preview feature)
   * @example ["protobuf"]
   */
  "preview-features"?: PreviewFeature[];
}

export const EmitterOptionsSchema: JSONSchemaType<AsyncAPIEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    "output-file": { type: "string", nullable: true },
    "file-type": { type: "string", enum: ["yaml", "json"], nullable: true },
    "asyncapi-id": { type: "string", nullable: true },
    "default-content-type": { type: "string", nullable: true },
    "preview-features": {
      type: "array",
      nullable: true,
      items: { type: "string", enum: [...PREVIEW_FEATURE_NAMES] },
    },
  },
  required: [],
};
