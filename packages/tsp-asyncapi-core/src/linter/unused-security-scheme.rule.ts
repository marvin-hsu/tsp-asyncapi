/**
 * Warns when a declared security scheme is never asked for.
 *
 * `resolveSecuritySchemes` writes every `@securityScheme` into
 * `components.securitySchemes`, whether or not anything names it. That is
 * the right behaviour for the emitter: a scheme is a declaration, and a
 * document that declares one has said something true.
 *
 * It is rarely what the author meant. `@useSecurity` is what puts a scheme
 * on a server, and a scheme nothing names protects nothing. The document
 * then advertises an authentication method no channel requires, which a
 * reader takes as a claim about the application.
 *
 * The inverse is already reported. `undeclared-security-scheme` catches a
 * `@useSecurity` that names a scheme nobody declared, and
 * `use-security-outside-server` catches one that reaches no server. This
 * side had nothing.
 *
 * ## Not in `recommended`
 *
 * Declaring a scheme nothing names is a real intention, not only a
 * forgotten `@useSecurity`. `components.securitySchemes` is a registry, and
 * a document may publish an authentication method that no channel requires
 * yet.
 *
 * This repository's own `examples/06-servers-and-security` does it: it
 * declares four schemes to show the four kinds, names two of them, and
 * comments one of the rest with "Kept for the legacy bridge only". That is
 * the evidence. A rule that fires on the project's own example is stating a
 * preference, and a preference belongs behind an opt-in.
 *
 * ## Why it needs the whole program
 *
 * A scheme is declared on one namespace and used from another, and
 * `components.securitySchemes` is a document-wide registry. So the answer is
 * not available at any single declaration: the walk collects every use, and
 * `exit` compares the two sets once the walk is done.
 */

import { createRule, paramMessage } from "@typespec/compiler";
// Not on the barrel. A record carries `nameTarget`, and only a reporter
// needs it; the barrel's `getSecuritySchemes` drops the target.
import { listSecuritySchemeRecords } from "../decorators/security/scheme-state.js";
import { getUsedSecuritySchemes } from "../decorators/index.js";

export const unusedSecuritySchemeRule = createRule({
  name: "unused-security-scheme",
  severity: "warning",
  description: "Require a declared security scheme to be named by `@useSecurity`.",
  messages: {
    default: paramMessage`Security scheme '${"name"}' is declared but no \`@useSecurity\` names it, so it reaches \`components.securitySchemes\` without protecting anything. Apply \`@useSecurity("${"name"}")\` to a namespace that declares a server, or remove the scheme.`,
  },
  create: (context) => {
    // `@useSecurity` applies to a namespace or an operation, so those two
    // callbacks see every application. The per-target reader is the public
    // one, which also applies the deduplication `listUsedSecuritySchemes`
    // decides, so this rule and the server builder agree on what counts as
    // a use.
    const used = new Set<string>();

    return {
      namespace: (namespace) => {
        for (const name of getUsedSecuritySchemes(context.program, namespace)) used.add(name);
      },
      operation: (operation) => {
        for (const name of getUsedSecuritySchemes(context.program, operation)) used.add(name);
      },
      exit: (program) => {
        for (const record of listSecuritySchemeRecords(program)) {
          const { name } = record.state;
          if (used.has(name)) continue;

          // `nameTarget` rather than the namespace. It is where the author
          // wrote the name, which is the thing this warning is about.
          context.reportDiagnostic({
            format: { name },
            target: record.nameTarget,
          });
        }
      },
    };
  },
});
