import { Program } from "@typespec/compiler";
import { reportDiagnostic } from "../../lib.js";

/**
 * One diagnostic report, exactly as `reportDiagnostic` accepts it.
 *
 * The report is taken whole and passed on unchanged. The alternative is to
 * take the code, the target, and the format as separate parameters and
 * rebuild the report here. That does not type-check. `reportDiagnostic` is
 * a union discriminated by `code`, and each code decides whether `format`
 * is required and which keys it holds. Rebuilding the report loses the link
 * between the code and its format. Passing the report through keeps the
 * check at the call site, where the code is a literal.
 */
type Report = Parameters<typeof reportDiagnostic>[1];

/**
 * The dedup ledger for one `SchemaBuilder`.
 *
 * Some diagnostics would otherwise go out more than once for one mistake.
 * There are two separate causes, and both are about the schema builder
 * visiting a type again rather than about the author writing anything twice.
 *
 * A model with lifted `@header` fields is built twice. Its payload component
 * and its own component resolve the same decorators on the same model. A
 * scalar has no build cache at all, unlike a named model, enum, or union,
 * which `registerNamed` builds once. So the whole `baseScalar` chain is
 * re-walked at every use site, and a scalar used by twenty properties would
 * report its one bad constraint twenty times.
 *
 * The ledger is per-instance, and a `SchemaBuilder` lives for one emit. So
 * the dedup never reaches across emits, and a diagnostic silenced in one
 * compilation cannot stay silent in the next.
 *
 * This used to be a bare `Map<Type, Set<string>>`. The map was threaded
 * through about fifteen parameter positions across two modules, and the
 * get-or-create-then-test idiom was written out three times. Each copy chose
 * its own key format, which is the part that matters: the key decides what
 * counts as "the same diagnostic", and that decision belongs in one place.
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
