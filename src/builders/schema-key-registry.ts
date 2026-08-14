import { Program, Type } from "@typespec/compiler";
import { reportDiagnostic } from "../lib.js";

/**
 * ============================================================================
 * `components.schemas` key-collision handling — an isolated, temporary layer.
 * ============================================================================
 *
 * `@typespec/asset-emitter`'s `Declaration`/`Scope` mechanism does **not**
 * dedup colliding declaration names on its own — `Scope.declarations` is a
 * plain array with zero uniqueness enforcement, and two declarations with the
 * identical `name` can be created with no diagnostics (verified empirically
 * against `@typespec/asset-emitter@^0.79.1`, see the architecture-review
 * discussion this migration followed). This module fills that gap: it is
 * wired into `SchemaKeyEmitter.declarationName` (in `schemas.ts`) as the
 * *only* place that decides a named declaration's actual
 * `components.schemas` key.
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
 * Remove or replace this module if `@typespec/asset-emitter` (or its eventual
 * successor) ever provides equivalent collision handling built in.
 * ============================================================================
 */

/**
 * Assigns and caches `components.schemas` keys for named declarations
 * (model, enum, named union).
 *
 * Computes exactly one candidate key — the bare name passed in, with no
 * namespace-qualification or numeric-suffix fallback. If that key is free, it
 * is registered and returned. If it is already taken by a **different**
 * `Type`, a `duplicate-schema-key` diagnostic error is reported and the same
 * (colliding) bare name is still returned — see `keyFor`'s doc comment for
 * why returning a colliding key, rather than inventing a fresh one, is the
 * deliberate degrade-after-error behavior here.
 *
 * Repeat calls for the same `Type` (already registered, whether cleanly or
 * via a reported collision) return the cached key without re-running the
 * check or re-reporting the diagnostic.
 */
export class SchemaKeyRegistry {
  private readonly keysByType = new Map<Type, string>();
  private readonly typesByKey = new Map<string, Type>();

  public constructor(private readonly program: Program) {}

  /**
   * Returns the `components.schemas` key for `type`, registering it on first
   * use. `name` is the single candidate key this declaration computes for
   * itself (a bare name, or — for template instantiations — a name already
   * composed with its type arguments' names/namespaces by the caller; see
   * `templateInstanceName` in `schemas.ts`). No further fallback is computed
   * here.
   */
  public keyFor(type: Type, name: string): string {
    const cached = this.keysByType.get(type);
    if (cached !== undefined) {
      return cached;
    }
    const owner = this.typesByKey.get(name);
    if (owner !== undefined && owner !== type) {
      // Collision with a *different* type: report and degrade. The colliding
      // name is still returned (rather than synthesizing an alternate one)
      // so `buildSchema`'s recursive callers get a `$ref`-able key back and
      // don't crash — the resulting document may have two declarations
      // sharing one `components.schemas` key (the second silently
      // overwriting the first when `getSchemas()` assembles its result
      // object), but that's the same "reported diagnostic, then degrade
      // gracefully rather than throw" idiom this builder already uses for
      // `missing-discriminator-property`/`encoded-name-override-conflict`.
      reportDiagnostic(this.program, {
        code: "duplicate-schema-key",
        target: type,
        format: { name },
      });
      this.keysByType.set(type, name);
      return name;
    }
    this.keysByType.set(type, name);
    this.typesByKey.set(name, type);
    return name;
  }

  /**
   * Releases the key claimed by `type`, if any — used when building that
   * type's schema body fails partway through, so the key is not left
   * reserved with no corresponding emitted schema (which would otherwise
   * leave any `$ref` to it dangling).
   */
  public release(type: Type): void {
    const key = this.keysByType.get(type);
    if (key === undefined) {
      return;
    }
    this.keysByType.delete(type);
    // Only clear the name -> type reservation if `type` is still its owner:
    // a type that lost the race (the collision branch above) never became
    // the owner in `typesByKey`, so releasing it must not evict whichever
    // other type actually holds that slot.
    if (this.typesByKey.get(key) === type) {
      this.typesByKey.delete(key);
    }
  }
}
