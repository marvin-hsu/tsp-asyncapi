import { createLinterRuleTester } from "@typespec/compiler/testing";
import type { Diagnostic, DiagnosticMessages, LinterRuleDefinition } from "@typespec/compiler";
import { AsyncAPITester } from "#emitter/testing.js";
import { PACKAGE_NAME } from "#emitter/lib.js";
import { createLibraryTester } from "./emitter-package.js";

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

/**
 * Builds a linter for a rule that reads the emitter options.
 *
 * The rule tester of the compiler builds its own compiler options, so it
 * cannot carry emitter options at all. A rule that reads `preview-features`
 * therefore has to run a normal compilation and enable itself by id. Two
 * suites wrote that compilation out by hand.
 *
 * The instance is built inside the returned function rather than once here,
 * for the reason `createRuleTester` gives: one instance carries one
 * compilation.
 *
 * @param rule - The full id of the rule, as a user would configure it
 * @param libraries - The libraries to load beside the emitter
 * @returns A function that compiles one source with the rule on
 */
export function createOptionsRuleLinter(rule: string, ...libraries: readonly string[]) {
  const base = createLibraryTester(...libraries);
  return async function lint(
    code: string,
    options: Record<string, unknown>,
  ): Promise<readonly Diagnostic[]> {
    const runner = await base.emit(PACKAGE_NAME, options).createInstance();
    const [, diagnostics] = await runner.compileAndDiagnose(code, {
      compilerOptions: { linterRuleSet: { enable: { [rule]: true } } },
    });
    return diagnostics;
  };
}
