import { DiagnosticSeverity, Parser } from "@asyncapi/parser";
import type { Diagnostic, Input } from "@asyncapi/parser";
import { ProtoBuffSchemaParser } from "@asyncapi/protobuf-schema-parser";
import { AvroSchemaParser } from "@asyncapi/avro-schema-parser";

/**
 * Shared parser instance. The parser is stateless between calls.
 *
 * The Protobuf schema parser is registered, so a payload with a Protobuf
 * `schemaFormat` has its text parsed rather than passed through. Without it,
 * such a payload only gets a structural check, and a proto text no consumer
 * could decode still validates. The parser needs one root message per text,
 * which is exactly the property the emitted documents must hold.
 *
 * The Avro schema parser is registered for the same reason. A payload with an
 * Avro `schemaFormat` carries an object, and an object passes every structural
 * check whatever it holds. This parser reads it as Avro, so a record with no
 * name or a field of a type Avro does not have fails here.
 */
const parser = new Parser();
parser.registerSchemaParser(ProtoBuffSchemaParser());
parser.registerSchemaParser(AvroSchemaParser());

/**
 * Human readable names for the severity scale of the parser.
 * The scale runs 0 = error, 1 = warning, 2 = information, 3 = hint.
 */
const SEVERITY_NAMES = ["error", "warning", "information", "hint"];

/**
 * Severity values that this helper accepts without failing.
 * Every other value counts as an error.
 */
const NON_ERROR_SEVERITIES: readonly number[] = [
  DiagnosticSeverity.Warning,
  DiagnosticSeverity.Information,
  DiagnosticSeverity.Hint,
];

/**
 * Returns the severity name of a diagnostic. Used for the printed report only.
 */
function severityName(diagnostic: Diagnostic): string {
  return SEVERITY_NAMES[diagnostic.severity] ?? String(diagnostic.severity);
}

/**
 * Tells if a diagnostic must fail the assertion.
 *
 * The test compares the numeric severity, not its name. A diagnostic with an
 * unknown or missing severity counts as an error. This helper must fail closed.
 */
function isError(diagnostic: Diagnostic): boolean {
  return !NON_ERROR_SEVERITIES.includes(diagnostic.severity);
}

/**
 * Formats one parser diagnostic into a single readable line.
 * The JSON path shows which node of the document is wrong.
 */
function formatDiagnostic(diagnostic: Diagnostic): string {
  const path = diagnostic.path.length ? `/${diagnostic.path.join("/")}` : "(document root)";
  return `  [${severityName(diagnostic)}] ${String(diagnostic.code)} at ${path}: ${diagnostic.message}`;
}

/**
 * Renders the document for a failure message.
 */
function renderDocument(doc: unknown): string {
  return typeof doc === "string" ? doc : JSON.stringify(doc, null, 2);
}

/**
 * Checks the document against the official AsyncAPI parser.
 *
 * The function reports rather than throws. It returns `null` when the
 * document is valid, and a full failure report when it is not. The matchers
 * in `test/setup.ts` turn that report into the message vitest prints, which
 * keeps the assertion itself visible at the call site.
 *
 * Severity policy: only diagnostics with severity `error` count as invalid.
 * Warnings, information and hints are style recommendations from the parser
 * rule set, not spec violations. One example is `asyncapi-latest-version`,
 * which only suggests a newer minor version. Failing on those would tie the
 * test suite to a rule set that changes between parser releases. Non-error
 * diagnostics are still printed on failure, because they help explain the
 * errors next to them.
 *
 * The major version is checked separately. The parser reports a 2.x document
 * with warnings only. A 2.x shaped document is a regression for this emitter,
 * so any major version other than 3 counts as invalid.
 *
 * @param doc - The emitted document, as an object or as a raw YAML or JSON string
 * @returns `null` when the document is valid, or the failure report
 */
export async function validateAsyncAPI(doc: unknown): Promise<string | null> {
  if (doc === null || doc === undefined) {
    return "Expected an AsyncAPI document to validate, but got nothing.";
  }

  const { document, diagnostics } = await parser.parse(doc as Input);
  const errors = diagnostics.filter(isError);
  if (errors.length > 0) {
    const report = diagnostics.map(formatDiagnostic).join("\n");
    return (
      `The AsyncAPI parser rejected the document with ${String(errors.length)} error(s):\n` +
      `${report}\n\nDocument under validation:\n${renderDocument(doc)}`
    );
  }

  if (document === undefined) {
    return (
      `The AsyncAPI parser reported no errors but produced no document.\n\n` +
      `Document under validation:\n${renderDocument(doc)}`
    );
  }

  const version = document.version();
  if (!version.startsWith("3.")) {
    return (
      `Expected an AsyncAPI document of major version 3, but got version ${version}.\n\n` +
      `Document under validation:\n${renderDocument(doc)}`
    );
  }

  return null;
}
