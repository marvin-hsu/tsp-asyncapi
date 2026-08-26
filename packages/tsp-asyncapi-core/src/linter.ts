/**
 * The linter, and the rule sets a user can extend.
 *
 * A rule answers the same question `resolve` answers: what did the author
 * declare? The difference is when it runs. A rule runs during semantic
 * analysis, so an editor shows it while the author types, and it runs whether
 * or not an emitter was asked for.
 *
 * That is why the rules here catch mistakes no diagnostic catches. A
 * diagnostic is a contract: once declared, removing it breaks a user. A rule
 * is opt-in, so it can say "you probably did not mean this" about something
 * that is not wrong.
 *
 * Rules are not a fourth stage. They read decorator state and write nothing.
 *
 * ## Where this is registered
 *
 * The compiler reads a `$linter` export from the entry point of the package
 * it loaded, and it builds each rule id from the specifier that package was
 * loaded under. A user loads `tsp-asyncapi`, so `tsp-asyncapi` is the package
 * whose entry point exports `$linter`, and the ids read `tsp-asyncapi/<rule>`.
 *
 * The rules live here rather than there because a rule reads decorator state,
 * and some of that state has no public name. `listChannels` is exported, but
 * `listBindings` is not. A rule in this package calls it directly.
 *
 * So this file exports `asyncAPILinter`, not `$linter`. A `$linter` export
 * here would register the same rules a second time, under a second prefix.
 */

import { defineLinter } from "@typespec/compiler";
import { LIBRARY_NAME } from "./lib.js";
import { avroContentTypeUndeclaredRule } from "./linter/avro-content-type-undeclared.rule.js";
import { channelWithoutOperationRule } from "./linter/channel-without-operation.rule.js";
import { missingServiceRule } from "./linter/missing-service.rule.js";
import { operationWithoutMessageRule } from "./linter/operation-without-message.rule.js";
import { protobufContentTypeUndeclaredRule } from "./linter/protobuf-content-type-undeclared.rule.js";
import { serverProtocolMismatchRule } from "./linter/server-protocol-mismatch.rule.js";
import { unusedSecuritySchemeRule } from "./linter/unused-security-scheme.rule.js";

/** The rules, in the order the reference documentation lists them. */
const rules = [
  missingServiceRule,
  channelWithoutOperationRule,
  operationWithoutMessageRule,
  serverProtocolMismatchRule,
  protobufContentTypeUndeclaredRule,
  avroContentTypeUndeclaredRule,
  // Not in `recommended`. See the rule's own file for why.
  unusedSecuritySchemeRule,
];

/** Builds the `<library>/<rule>` reference a rule set entry needs. */
function ref(name: string): `${string}/${string}` {
  return `${LIBRARY_NAME}/${name}`;
}

/**
 * The linter definition.
 *
 * `recommended` holds the rules that catch a mistake rather than state an
 * opinion. A rule belongs here when the author almost certainly did not mean
 * what they wrote.
 *
 * There is no `all` rule set. The compiler synthesizes one enabling every
 * rule when a linter does not declare it, and a hand-written `all` would be
 * one more list to forget to update.
 *
 * @public
 */
export const asyncAPILinter = defineLinter({
  rules,
  ruleSets: {
    recommended: {
      enable: {
        [ref(missingServiceRule.name)]: true,
        [ref(channelWithoutOperationRule.name)]: true,
        [ref(operationWithoutMessageRule.name)]: true,
        [ref(protobufContentTypeUndeclaredRule.name)]: true,
        [ref(avroContentTypeUndeclaredRule.name)]: true,
        [ref(serverProtocolMismatchRule.name)]: true,
      },
    },
  },
});
