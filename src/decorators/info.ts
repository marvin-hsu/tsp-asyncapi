import { DecoratorContext, Namespace, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";

const infoStateKey = Symbol.for("tsp-asyncapi.info");

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

const [getInfoInternal, setInfo] = useStateMap<Namespace, AsyncAPIInfoState>(infoStateKey);

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
 * @public
 */
export function $info(context: DecoratorContext, target: Namespace, info: AsyncAPIInfoState) {
  const infoData: AsyncAPIInfoState = { ...info };
  if (!infoData.version) infoData.version = "0.0.0";
  setInfo(context.program, target, infoData);
}

/**
 * Reads back the AsyncAPI `info` metadata set by `@info`.
 *
 * @param program - The program to read the state from
 * @param target - The namespace the decorator was applied to
 * @returns The recorded info state, or `undefined` when the decorator was
 * never applied
 *
 * @public
 */
export function getInfo(program: Program, target: Namespace): AsyncAPIInfoState | undefined {
  return getInfoInternal(program, target);
}
