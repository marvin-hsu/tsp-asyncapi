import { DecoratorContext, Namespace, Type, Program } from "@typespec/compiler";

export const namespace = "AsyncAPI";

const infoStateKey = Symbol.for("typespec-asyncapi.info");

/**
 * State interface representing the extracted info data.
 * @internal
 */
export interface AsyncAPIInfoState {
  version: string;
  description?: string;
  termsOfService?: string;
  contact?: { name?: string; url?: string; email?: string };
  license?: { name: string; url?: string };
}

/**
 * Sets the AsyncAPI `info` metadata for the service.
 *
 * @param context - The decorator context
 * @param target - The namespace to apply this decorator to
 * @param info - The info object matching AsyncAPIInfo shape
 *
 * @example
 * ```typespec
 * @info(#{
 *   version: "1.0.0",
 *   description: "This is a sample Order Service API.",
 *   contact: #{ name: "API Support", email: "support@example.com" },
 *   license: #{ name: "MIT", url: "https://opensource.org/licenses/MIT" }
 * })
 * namespace Orders;
 * ```
 *
 * @category Decorators
 * @public
 */
export function $info(context: DecoratorContext, target: Namespace, info: AsyncAPIInfoState) {
  const infoData: AsyncAPIInfoState = { ...info };
  if (!infoData.version) infoData.version = "0.0.0";
  context.program.stateMap(infoStateKey).set(target, infoData);
}

export function getInfo(program: Program, target: Namespace): AsyncAPIInfoState | undefined {
  return program.stateMap(infoStateKey).get(target) as AsyncAPIInfoState | undefined;
}

const externalDocsKey = Symbol.for("typespec-asyncapi.externalDocs");

/**
 * State interface representing external documentation.
 * @internal
 */
export interface ExternalDocsState {
  url: string;
  description?: string;
}

/**
 * Attaches external documentation to a component or namespace.
 *
 * @param context - The decorator context
 * @param target - The target type
 * @param url - The URL for the target documentation
 * @param description - A short description of the target documentation
 *
 * @example
 * ```typespec
 * @externalDocs("https://example.com/docs", "Find more info here")
 * namespace Orders;
 * ```
 *
 * @category Decorators
 * @public
 */
export function $externalDocs(
  context: DecoratorContext,
  target: Type,
  url: string,
  description?: string,
) {
  context.program.stateMap(externalDocsKey).set(target, { url, description });
}

export function getExternalDocs(program: Program, target: Type): ExternalDocsState | undefined {
  return program.stateMap(externalDocsKey).get(target) as ExternalDocsState | undefined;
}
