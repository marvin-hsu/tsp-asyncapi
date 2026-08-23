import { createLinterRuleTester } from "@typespec/compiler/testing";
import type { DiagnosticMessages, LinterRuleDefinition } from "@typespec/compiler";
import { AsyncAPITester } from "#emitter/testing.js";
import { PACKAGE_NAME } from "#emitter/lib.js";

/**
 * Builds a tester for one linter rule.
 *
 * The library name is the emitter package, because that is the specifier a
 * user loads and the compiler builds each rule id from the specifier the
 * library was loaded under. A rule id therefore reads
 * `tsp-asyncapi/<rule>`, and passing anything else here would test an id no
 * user can ever configure.
 *
 * Call this inside each test rather than once at module scope. A
 * `TesterInstance` carries one compilation, so a shared instance would let
 * one case observe the types another case declared.
 *
 * @param rule - The rule under test
 * @returns A tester for that rule
 */
export async function createRuleTester(rule: LinterRuleDefinition<string, DiagnosticMessages>) {
  const runner = await AsyncAPITester.createInstance();
  return createLinterRuleTester(runner, rule, PACKAGE_NAME);
}

/**
 * Builds a tester for a rule that needs more than one file.
 *
 * A rule reads the whole program, and a declaration in one file changes the
 * answer for another. The plain tester compiles `main.tsp` alone, so a
 * second file has to be imported by name for the compiler to load it.
 *
 * @param rule - The rule under test
 * @param imports - The files to import, such as `"./other.tsp"`
 * @returns A tester for that rule
 */
export async function createMultiFileRuleTester(
  rule: LinterRuleDefinition<string, DiagnosticMessages>,
  ...imports: string[]
) {
  const runner = await AsyncAPITester.import(...imports).createInstance();
  return createLinterRuleTester(runner, rule, PACKAGE_NAME);
}
