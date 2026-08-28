import { DiagnosticSeverity, Parser } from "@asyncapi/parser";
import type { Diagnostic, Input } from "@asyncapi/parser";
import { ProtoBuffSchemaParser } from "@asyncapi/protobuf-schema-parser";
import { AvroSchemaParser } from "@asyncapi/avro-schema-parser";

/**
 * Shared parser instance. The parser is stateless between calls.
 *
 * The Protobuf schema parser is registered. Without it, a Protobuf payload
 * only gets a structural check, and proto text no consumer could decode
 * would still validate. This parser enforces one root message per text,
 * matching what every emitted document must hold.
 *
 * The Avro schema parser is registered for the same reason. An Avro payload
 * is an object, and an object passes any structural check regardless of
 * content. This parser reads it as Avro, so a record with no name, or a
 * field of a type Avro lacks, fails here.
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

/** Returns the severity name of a diagnostic, for the printed report only. */
function severityName(diagnostic: Diagnostic): string {
  return SEVERITY_NAMES[diagnostic.severity] ?? String(diagnostic.severity);
}

/**
 * Tells if a diagnostic must fail the assertion.
 *
 * This compares the numeric severity, not its name, and fails closed: a
 * diagnostic with an unknown or missing severity counts as an error.
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

/** Renders the document for a failure message. */
function renderDocument(doc: unknown): string {
  return typeof doc === "string" ? doc : JSON.stringify(doc, null, 2);
}

/**
 * Checks the document against the official AsyncAPI parser.
 *
 * Reports rather than throws: returns `null` when the document is valid,
 * and a full failure report otherwise. The matchers in `test/setup.ts` turn
 * that report into the message vitest prints, keeping the assertion itself
 * visible at the call site.
 *
 * Severity policy: only an `error` severity counts as invalid. Warnings,
 * information, and hints are style recommendations from the parser's rule
 * set, not spec violations, like `asyncapi-latest-version` suggesting a
 * newer minor version. Failing on those would tie this suite to a rule set
 * that changes between parser releases. Non-error diagnostics still print
 * on failure, to help explain the errors next to them.
 *
 * The major version is checked separately, because the parser only warns
 * on a 2.x document. A 2.x shape is a regression here, so any version other
 * than 3 counts as invalid.
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
