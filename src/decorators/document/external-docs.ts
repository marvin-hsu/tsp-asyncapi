import { DecoratorContext, Program, Type } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../../lib.js";
import { isAbsoluteUrl } from "../absolute-url.js";

const externalDocsKey = Symbol.for("tsp-asyncapi.externalDocs");

/**
 * State interface representing external documentation.
 * @internal
 */
export interface ExternalDocsState {
  url: string;
  description?: string;
}

const [getExternalDocsInternal, setExternalDocs] = useStateMap<Type, ExternalDocsState>(
  externalDocsKey,
);

/**
 * Attaches external documentation to a component or namespace.
 *
 * AsyncAPI requires an absolute URL here. A relative one makes the official
 * parser reject the whole document, so such an application is reported and
 * dropped. The link then reaches neither `info` nor a server.
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
 * @public
 */
export function $externalDocs(
  context: DecoratorContext,
  target: Type,
  url: string,
  description?: string,
) {
  const trimmed = url.trim();
  if (!isAbsoluteUrl(trimmed)) {
    reportDiagnostic(context.program, {
      code: "invalid-url",
      format: { field: "url", url },
      target: context.getArgumentTarget(0) ?? target,
    });
    return;
  }
  setExternalDocs(context.program, target, { url: trimmed, description });
}

/**
 * Reads back the external documentation set by `@externalDocs`.
 *
 * @param program - The program to read the state from
 * @param target - The type the decorator was applied to
 * @returns The recorded external-docs state, or `undefined` when the
 * decorator was never applied
 *
 * @public
 */
export function getExternalDocs(program: Program, target: Type): ExternalDocsState | undefined {
  return getExternalDocsInternal(program, target);
}
