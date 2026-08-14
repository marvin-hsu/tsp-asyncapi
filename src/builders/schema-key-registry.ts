import { Program, Type } from "@typespec/compiler";
import {
  BasicScope,
  BasicSymbol,
  createOutputBinder,
  OutputSymbol,
  renderTree,
} from "@alloy-js/core";
import { reportDiagnostic } from "../lib.js";

/**
 * ============================================================================
 * `components.schemas` key-collision handling — an isolated, temporary layer.
 * ============================================================================
 *
 * This module is the naming/collision layer for `components.schemas` keys,
 * built on top of `@alloy-js/core`'s `Binder`/`OutputScope`/`OutputSymbol`
 * name-conflict machinery (verified standalone-usable on
 * `spike/asset-emitter-schema-key`, commit "spike: confirm Alloy's
 * Binder/NameConflictResolver works standalone" — see that spike for the
 * empirical findings this port relies on). It replaces an earlier version of
 * this same module that ported the identical policy onto
 * `@typespec/asset-emitter`'s `Declaration`/`Scope` (which, unlike Alloy,
 * does zero dedup/collision detection of its own — `Scope.declarations` was
 * a plain array).
 *
 * Policy (architecture review, 2026-08-14 — supersedes the earlier
 * auto-qualify/numeric-suffix ladder, see `plan/03-schemas.md` 2.10 finding
 * 107): a name collision is a **hard diagnostic error**, not something this
 * emitter silently resolves on the user's behalf. This mirrors
 * `@typespec/openapi`'s own `checkDuplicateTypeName` / `duplicate-type-name`
 * diagnostic (`packages/openapi/src/helpers.ts` in microsoft/typespec),
 * verified firsthand as that package's actual, shipped behavior: it reports
 * an error and lets the caller carry on, rather than inventing an alternate
 * name.
 *
 * Ported onto Alloy's own hook instead of a hand-rolled `Map`-based check:
 * `createOutputBinder({ nameConflictResolver })` is given a resolver that
 * reports our `duplicate-schema-key` diagnostic for every symbol beyond the
 * first sharing an original name, and deliberately never assigns
 * `symbol.name`/`symbol.deconflictedName` — i.e. it never renames, matching
 * the exact same "collision is a hard error, not auto-resolved" policy the
 * previous, hand-rolled version enforced.
 *
 * A single `BasicScope` ("components.schemas") holds one `BasicSymbol` per
 * named declaration (model, enum, named union), constructed with an explicit
 * `{ binder }` option so neither the scope nor its symbols require an active
 * JSX/component render context to exist — `BasicScope`/`BasicSymbol` only
 * fall back to `useBinder()` when no `binder` option is supplied. Symbol
 * construction is wrapped in `renderTree(() => { ...; return null; })`
 * anyway, though — not because a render context is needed to *create* the
 * symbol, but because Alloy's name-conflict resolution is a queued reactive
 * job, not something that runs synchronously at symbol-construction time
 * (verified empirically in the spike above: reading `symbol.name` right
 * after constructing two colliding symbols returns each one's *unresolved*
 * original name). `renderTree` is the lower-level primitive behind
 * `render`/`renderAsync` and explicitly flushes the job queue before
 * returning, so reading `symbol.name` right after `renderTree(...)` returns
 * is guaranteed to observe the already-resolved (in our policy: unrenamed,
 * but diagnosed-if-colliding) name. One `renderTree` call is made per
 * `keyFor` invocation that actually needs to create a new symbol (cache hits
 * skip it entirely) — simplest-correct choice; `buildSchema`'s incremental,
 * recursive walk can call `keyFor` many times per emit, but per-call
 * `renderTree` overhead was not observed to be a problem against this
 * project's test suite, so no batching/outer-`renderTree` optimization was
 * pursued.
 *
 * Remove or replace this module if `@typespec/emitter-framework`/
 * `@alloy-js/core` (or their eventual successors) ever provide equivalent
 * collision handling built in for this exact use case, or if this project
 * migrates to using Alloy's own `<SourceFile>`/component-tree rendering for
 * the whole emitter (at which point this registry's manual `renderTree`
 * calls would be replaced by symbols created naturally during a real render
 * pass).
 * ============================================================================
 */

/**
 * Assigns and caches `components.schemas` keys for named declarations
 * (model, enum, named union).
 *
 * Computes exactly one candidate key — the bare name passed in, with no
 * namespace-qualification or numeric-suffix fallback. If that key is free, it
 * is registered and returned. If it is already taken by a **different**
 * `Type`, a `duplicate-schema-key` diagnostic error is reported (via Alloy's
 * `nameConflictResolver`) and the same (colliding) bare name is still
 * returned — see `keyFor`'s doc comment for why returning a colliding key,
 * rather than inventing a fresh one, is the deliberate degrade-after-error
 * behavior here.
 *
 * Repeat calls for the same `Type` (already registered, whether cleanly or
 * via a reported collision) return the cached key without re-running the
 * check or re-reporting the diagnostic.
 */
export class SchemaKeyRegistry {
  private readonly scope: BasicScope;
  private readonly namesByType = new Map<Type, string>();
  private readonly symbolsByType = new Map<Type, OutputSymbol>();
  // Guards against re-reporting the same symbol's collision more than once:
  // Alloy's `nameConflictResolver` re-runs (as a reactive job) every time the
  // set of same-named symbols changes, replaying already-diagnosed symbols
  // alongside any newly-added one.
  private readonly reportedSymbols = new Set<OutputSymbol>();

  public constructor(private readonly program: Program) {
    const binder = createOutputBinder({
      nameConflictResolver: (name, symbols) => {
        // `symbols[0]` keeps its bare name, matching the hard-error policy:
        // nothing is ever renamed here. Every symbol beyond it shares that
        // same original name with a *different* type, which is a genuine
        // collision under this registry's policy.
        for (let i = 1; i < symbols.length; i++) {
          const symbol = symbols[i];
          if (this.reportedSymbols.has(symbol)) {
            continue;
          }
          this.reportedSymbols.add(symbol);
          const type = symbol.metadata.type as Type;
          reportDiagnostic(this.program, {
            code: "duplicate-schema-key",
            target: type,
            format: { name },
          });
        }
      },
    });
    this.scope = new BasicScope("components.schemas", undefined, { binder });
  }

  /**
   * Returns the `components.schemas` key for `type`, registering it on first
   * use. `name` is the single candidate key this declaration computes for
   * itself (a bare name, or — for template instantiations — a name already
   * composed with its type arguments' names/namespaces by the caller; see
   * `templateInstanceName` in `schemas.ts`). No further fallback is computed
   * here.
   */
  public keyFor(type: Type, name: string): string {
    const cached = this.namesByType.get(type);
    if (cached !== undefined) {
      return cached;
    }
    let symbol: OutputSymbol | undefined;
    // Symbol creation must happen inside `renderTree` so Alloy's queued
    // name-conflict resolution job (see this module's top-of-file comment)
    // has flushed by the time we read `symbol.name` below.
    renderTree(() => {
      symbol = new BasicSymbol(name, this.scope.symbols, {
        binder: this.scope.binder,
        metadata: { type },
      });
      return null;
    });
    if (symbol === undefined) {
      // Cannot happen: the callback above always assigns `symbol` before
      // `renderTree` returns.
      throw new Error(`Failed to create a components.schemas symbol for "${name}".`);
    }
    this.symbolsByType.set(type, symbol);
    this.namesByType.set(type, symbol.name);
    return symbol.name;
  }

  /**
   * Releases the key claimed by `type`, if any — used when building that
   * type's schema body fails partway through, so the key is not left
   * reserved with no corresponding emitted schema (which would otherwise
   * leave any `$ref` to it dangling).
   */
  public release(type: Type): void {
    const symbol = this.symbolsByType.get(type);
    if (symbol === undefined) {
      return;
    }
    symbol.delete();
    this.symbolsByType.delete(type);
    this.namesByType.delete(type);
    this.reportedSymbols.delete(symbol);
  }
}
