import { DecoratorContext, Program } from "@typespec/compiler";
import { COMPONENTS_KEY_PATTERN } from "../../constants.js";
import { reportDiagnostic } from "../../lib.js";
import { isSameApplication, sourcePositionOf } from "../../source-order.js";
import {
  getUseSecurityInternal,
  listUsedSecuritySchemes,
  setUseSecurity,
  UseSecurityRecord,
  UseSecurityTarget,
} from "./use-security-state.js";

export type { UseSecurityTarget } from "./use-security-state.js";

/**
 * Requires one security scheme on the servers of a namespace, or on one
 * operation.
 * This decorator is repeatable. Each application on a namespace adds one
 * scheme to the `security` array of every server that namespace declares.
 * Each application on an operation adds one scheme to the `security` array
 * of that operation.
 *
 * Operation security is additive. It never replaces the security of the
 * server. The emitted array on an operation holds the schemes of that
 * operation alone, and a client satisfies the array of the server as well.
 *
 * AsyncAPI reads that array as OR. A client satisfies one of the listed
 * schemes, not all of them.
 *
 * The emitted entry is always a reference into
 * `components.securitySchemes`. The specification also allows an inline
 * scheme there. One output path keeps every emitted document valid and
 * keeps the schemes in one place.
 *
 * The name must fit the Components Object character set, the same set
 * `@securityScheme` checks. The name is written into a JSON Pointer, and a
 * character outside that set makes the pointer malformed. Such a name also
 * names no scheme any `@securityScheme` could define. A name outside the set
 * is reported, and the application is dropped.
 *
 * The name is used exactly as written. It is not trimmed first, for the same
 * reason `@securityScheme` does not trim the key it defines. Trimming here
 * would let `@useSecurity(" sc ")` reach a scheme that
 * `@securityScheme(" sc ")` can never define, because that application is
 * rejected by the same character set.
 *
 * The name is checked against the declared schemes as well, but not here.
 * The check runs while the document is built, because a `@securityScheme`
 * anywhere in the program can still arrive after this decorator runs.
 *
 * @param context - The decorator context
 * @param target - The namespace whose servers require this scheme, or the
 * operation that requires it
 * @param schemeName - The name given to a `@securityScheme`
 *
 * @example
 * ```typespec
 * @securityScheme("kafka-scram", #{ type: "scramSha512" })
 * @useSecurity("kafka-scram")
 * @server("production", #{ host: "kafka.example.com:9092", protocol: "kafka" })
 * namespace Orders;
 * ```
 *
 * @public
 */
export function $useSecurity(
  context: DecoratorContext,
  target: UseSecurityTarget,
  schemeName: string,
) {
  // Report on the name argument, the same node the reference is built from.
  const nameTarget = context.getArgumentTarget(0) ?? target;

  // The name is tested as written, the same way `@securityScheme` tests the
  // key it defines. So a padded name is rejected on both sides.
  if (!COMPONENTS_KEY_PATTERN.test(schemeName)) {
    // The name is written by hand, so it is not rewritten to a legal one.
    // This follows `@securityScheme`, which drops a name it cannot use.
    reportDiagnostic(context.program, {
      code: "invalid-security-scheme-name",
      format: { name: schemeName },
      target: nameTarget,
    });
    return;
  }

  const record: UseSecurityRecord = {
    schemeName,
    ...sourcePositionOf(context.decoratorTarget),
    target: nameTarget,
  };

  const records = getUseSecurityInternal(context.program, target) ?? [];

  // One augment decorator runs once per declaration of its target
  // namespace, so a reopened namespace runs the same statement again. Those
  // runs are one application. Two distinct statements can never share a
  // file and a position.
  if (records.some((existing) => isSameApplication(existing, record))) return;

  records.push(record);
  setUseSecurity(context.program, target, records);
}

/**
 * Reads back the scheme names required by `@useSecurity`.
 *
 * A name given more than once yields one entry. AsyncAPI reads the
 * `security` array as OR, so a repeated name adds nothing.
 *
 * @param program - The program to read the state from
 * @param target - The namespace or operation the decorator was applied to
 * @returns The scheme names, in source order. The list is empty when the
 * decorator was never applied.
 *
 * @public
 */
export function getUsedSecuritySchemes(program: Program, target: UseSecurityTarget): string[] {
  return listUsedSecuritySchemes(program, target).map((record) => record.schemeName);
}
