import { createTypeSpecLibrary, JSONSchemaType } from "@typespec/compiler";

/**
 * Configuration options for the AsyncAPI emitter.
 *
 * @example
 * ```yaml
 * # tspconfig.yaml
 * emit:
 *   - "typespec-asyncapi"
 * options:
 *   "typespec-asyncapi":
 *     output-file: "asyncapi.yaml"
 *     file-type: "yaml"
 *     asyncapi-id: "urn:com:example:orders"
 *     default-content-type: "application/json"
 * ```
 *
 * @category Library
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
}

const EmitterOptionsSchema: JSONSchemaType<AsyncAPIEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    "output-file": { type: "string", nullable: true },
    "file-type": { type: "string", enum: ["yaml", "json"], nullable: true },
    "asyncapi-id": { type: "string", nullable: true },
    "default-content-type": { type: "string", nullable: true },
  },
  required: [],
};

/**
 * @category Library
 * @public
 */
export const $lib = createTypeSpecLibrary({
  name: "typespec-asyncapi",
  diagnostics: {
    "multiple-services": {
      severity: "warning",
      messages: {
        default:
          "Multiple services found. AsyncAPI only supports one service per document. The first one will be used.",
      },
    },
  },
  emitter: {
    options: EmitterOptionsSchema,
  },
});

/**
 * @category Library
 * @public
 */
export const reportDiagnostic = $lib.reportDiagnostic.bind($lib);
export const createDiagnostic = $lib.createDiagnostic.bind($lib);
