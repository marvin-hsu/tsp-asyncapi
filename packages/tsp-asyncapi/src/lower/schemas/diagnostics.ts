import { Program } from "@typespec/compiler";
import { reportDiagnostic } from "tsp-asyncapi-core";

/**
 * One diagnostic report, exactly as `reportDiagnostic` accepts it.
 *
 * `reportDiagnostic` is a union discriminated by `code`; each code decides
 * whether `format` is required and which keys it holds. Taking the report
 * whole, instead of code/target/format as separate parameters, keeps that
 * check at the call site, where the code is a literal.
 */
type Report = Parameters<typeof reportDiagnostic>[1];

/**
 * Dedupes repeat diagnostics that come from re-visiting a type, not from the
 * author writing a mistake twice.
 *
 * A model with lifted `@header` fields is built twice, once for its own
 * component and once for its payload. Both resolve the same decorators on
 * the same model. A scalar has no build cache, so its whole `baseScalar`
 * chain re-walks at every use site. A scalar used by twenty properties would
 * report one bad constraint twenty times without this ledger.
 *
 * The ledger is per instance, and one `SchemaBuilder` lives for one emit. A
 * diagnostic silenced in one compilation is not silenced in the next.
 */
export class SchemaDiagnostics {
  private readonly reported = new Map<Report["target"], Set<string>>();

  public constructor(private readonly program: Program) {}

  /**
   * Reports `report` unless the same diagnostic already went out for its
   * target.
   *
   * @param report - The diagnostic to report
   * @param distinguishBy - Splits one code into several independent
   * diagnostics for one target. Leave it out when the code alone identifies
   * the mistake.
   * @returns True when the report went out, false when it was a repeat
   */
  public reportOnce(report: Report, distinguishBy?: string): boolean {
    const key = distinguishBy === undefined ? report.code : `${report.code}:${distinguishBy}`;
    let keys = this.reported.get(report.target);
    if (keys === undefined) {
      keys = new Set();
      this.reported.set(report.target, keys);
    }
    if (keys.has(key)) {
      return false;
    }
    keys.add(key);
    reportDiagnostic(this.program, report);
    return true;
  }
}
