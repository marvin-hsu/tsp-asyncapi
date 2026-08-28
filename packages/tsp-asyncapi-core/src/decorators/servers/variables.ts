import { DecoratorContext, DiagnosticTarget } from "@typespec/compiler";
import { reportDiagnostic } from "../../lib.js";
import { AsyncAPIServerVariableState } from "./state.js";

/**
 * The value argument of the `variables` field of `@server`, before any
 * check runs on it.
 */
export type ServerVariablesArgument = Record<string, AsyncAPIServerVariableState>;

/**
 * Matches one `{var}` template in a `host` or a `pathname`.
 * A template never spans a path separator, so a `pathname` such as
 * `/{a}/{b}` is two templates, not one. A template holds no brace of its
 * own, so the match cannot run past its own closing brace.
 * This mirrors `extractParamsFromPath` of `@typespec/http`.
 */
const TEMPLATE_PATTERN = /\{[^/{}]+\}/g;

/** Lists the template names one field uses, in the order they appear. */
function extractTemplateNames(text: string): string[] {
  return (text.match(TEMPLATE_PATTERN) ?? []).map((match) => match.slice(1, -1));
}

/**
 * Trims every string a variable carries and drops the empty ones.
 *
 * A blank optional value carries no information, so it is stored as absent.
 * That is the same rule the string fields of `@server` follow.
 *
 * A blank entry of `enum` or of `examples` names no value, so it is dropped
 * and reported instead of dropped in silence. A list of blank entries would
 * otherwise vanish whole, leaving the variable with no constraint at all,
 * the opposite of what the author wrote. The `default`-not-in-`enum` check
 * reads this list afterward, so a lost list would silence that check too.
 */
function normalizeVariable(
  context: DecoratorContext,
  name: string,
  variable: AsyncAPIServerVariableState,
  configTarget: DiagnosticTarget,
): AsyncAPIServerVariableState {
  const normalized: AsyncAPIServerVariableState = {};

  for (const field of ["default", "description"] as const) {
    const value = variable[field]?.trim();
    if (value !== undefined && value !== "") normalized[field] = value;
  }

  for (const field of ["enum", "examples"] as const) {
    const entries = variable[field]?.map((entry) => entry.trim());
    if (entries === undefined) continue;
    // One diagnostic covers the whole list. Every blank entry is the same
    // mistake, so naming it once is enough.
    if (entries.includes("")) {
      reportDiagnostic(context.program, {
        code: "blank-server-variable-value",
        format: { name, field },
        target: configTarget,
      });
    }
    const values = entries.filter((entry) => entry !== "");
    // Only `enum` carries `uniqueItems` in the spec, so only it is deduped.
    // `examples` may legally repeat a value.
    //
    // The trim above can create the repeat by itself: an author who writes
    // `#["eu", " eu "]` wrote two different strings and sees nothing wrong,
    // while the emitted list holds `"eu"` twice and fails validation. So the
    // repeat is reported rather than dropped in silence.
    const kept = field === "enum" ? dropRepeats(context, name, values) : values;
    if (kept.length > 0) normalized[field] = kept;
  }

  return normalized;
}

/**
 * Keeps the first of every repeated value, and reports each repeat once.
 *
 * The first occurrence wins, so the order the author wrote survives. A value
 * that repeats three times is one mistake, so it is reported once.
 */
function dropRepeats(context: DecoratorContext, name: string, values: string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  const reported = new Set<string>();
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      kept.push(value);
      continue;
    }
    if (reported.has(value)) continue;
    reported.add(value);
    reportDiagnostic(context.program, {
      code: "duplicate-server-variable-value",
      format: { name, value },
      target: context.decoratorTarget,
    });
  }
  return kept;
}

/**
 * Checks the `{var}` templates of one server against its declared variables,
 * and normalizes the declarations. `host` and `pathname` both support
 * templates, so both fields are checked against one set of declarations.
 *
 * Every problem here degrades the server rather than dropping it. This
 * follows `$server` of `@typespec/http`, which reports a missing parameter
 * and then keeps the rest of the server. A template with no declaration
 * stays in the emitted text, because rewriting the host would change the
 * address the author wrote.
 */
export function resolveServerVariables(
  context: DecoratorContext,
  host: string,
  pathname: string | undefined,
  variables: ServerVariablesArgument | undefined,
  configTarget: DiagnosticTarget,
): Record<string, AsyncAPIServerVariableState> | undefined {
  const used = new Set([...extractTemplateNames(host), ...extractTemplateNames(pathname ?? "")]);
  const declared = new Map(Object.entries(variables ?? {}));

  for (const name of used) {
    if (declared.has(name)) continue;
    reportDiagnostic(context.program, {
      code: "undeclared-server-variable",
      format: { name },
      target: configTarget,
    });
  }

  const resolved: Record<string, AsyncAPIServerVariableState> = {};
  for (const [name, variable] of declared) {
    if (!used.has(name)) {
      reportDiagnostic(context.program, {
        code: "unused-server-variable",
        format: { name },
        target: configTarget,
      });
    }

    const normalized = normalizeVariable(context, name, variable, configTarget);
    if (
      normalized.default !== undefined &&
      normalized.enum !== undefined &&
      !normalized.enum.includes(normalized.default)
    ) {
      reportDiagnostic(context.program, {
        code: "server-variable-default-not-in-enum",
        format: { name, default: normalized.default },
        target: configTarget,
      });
    }
    resolved[name] = normalized;
  }

  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

/**
 * Copies one set of variables, deep enough that the caller cannot mutate the
 * recorded state through the copy.
 *
 * `getServers` hands out a copy of every server. A shallow copy of the
 * server would still share this nested graph, so the copy is made here.
 */
export function copyServerVariables(
  variables: Record<string, AsyncAPIServerVariableState>,
): Record<string, AsyncAPIServerVariableState> {
  return Object.fromEntries(
    Object.entries(variables).map(([name, variable]) => [
      name,
      {
        ...variable,
        ...(variable.enum ? { enum: [...variable.enum] } : {}),
        ...(variable.examples ? { examples: [...variable.examples] } : {}),
      },
    ]),
  );
}
