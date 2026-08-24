/**
 * Deciding which fragments earn a place in `components`.
 *
 * A fragment is a piece of the document that more than one place can carry:
 * a Bindings Object, a Tag Object, an External Documentation Object. When two
 * places carry the same one, the document repeats it. `components` plus a
 * `$ref` says it once.
 *
 * ## Two policies, split by whether the author named the thing
 *
 * `plan/09-advanced.md` settled the rule this project follows: a named
 * TypeSpec declaration is hoisted and referenced, and something written
 * inline is expanded in place. `SchemaBuilder` has run that rule since
 * Phase 2, and `@typespec/openapi3` runs the same one.
 *
 * A tag has a name the author wrote. So does a channel parameter, a server
 * variable, and a scalar. Those are `"named"`: one use is enough.
 *
 * A Bindings Object does not. Its config arrives as a `valueof` object value,
 * and `ObjectValue` carries no pointer back to a declaration, so this emitter
 * cannot tell `#{ … }` written in place from `const prod = #{ … }`. The same
 * holds for an External Documentation Object and a Correlation ID Object.
 * Those are `"repeated"`: the second use is the evidence that sharing helps,
 * and a fragment used once stays where it is rather than gaining a `$ref` hop
 * that saves nothing.
 *
 * ## Why two passes
 *
 * `SchemaBuilder` promotes by rewriting the object it already emitted
 * (`lower/schemas/declarations.ts`). It has to: which schemas exist is
 * unknowable until the walk finishes.
 *
 * Nothing else here has that problem. The resolved model holds every server,
 * channel, operation and message before the first byte is written. So this
 * surveys first and writes second, and it never mutates an object a caller
 * already holds. That matters, because every lowering site copies its
 * fragment defensively today, and a rewrite would need those copies gone.
 */

/** How one kind of fragment earns a place in `components`. */
export interface PromotionPolicy<T> {
  /**
   * When a fragment earns a key.
   *
   * `"named"` promotes on the first use, because the author named the thing.
   * `"repeated"` waits for the second, because nothing named it and one use
   * has nothing to share with.
   */
  readonly when: "named" | "repeated";
  /**
   * The key this fragment asks for.
   *
   * Every key comes from something the author wrote: the fragment's own name,
   * the declaration it hangs on, or the site that met it first. A key is
   * never invented from a hash of the content.
   */
  key(value: T, site: string): string;
}

/**
 * The canonical form of a fragment, used to decide that two are the same one.
 *
 * Keys are sorted, so two fragments built in different orders still match.
 * The fragment is already lowered when this runs, so what is compared is what
 * would be written.
 */
function identityOf(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return item;
    const entries = Object.entries(item as Record<string, unknown>);
    // `localeCompare` rather than `<`, because the sort only has to be
    // stable, and a locale-aware comparison is what this repository's lint
    // rules ask for on strings.
    entries.sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries);
  });
}

/** What the survey learned about one fragment. */
interface Sighting<T> {
  readonly value: T;
  /** The key the first site asked for. A later site cannot rename it. */
  readonly key: string;
  uses: number;
}

/**
 * Promotion for one section of `components`, over one document build.
 *
 * The caller surveys every site, calls {@link Promoter.freeze}, and then
 * builds. During the build {@link Promoter.keyFor} answers whether a site
 * writes a reference or the fragment itself.
 */
export class Promoter<T> {
  readonly #policy: PromotionPolicy<T>;
  readonly #seen = new Map<string, Sighting<T>>();
  #frozen = false;

  public constructor(policy: PromotionPolicy<T>) {
    this.#policy = policy;
  }

  /**
   * Records one site carrying one fragment.
   *
   * @param value - The lowered fragment
   * @param site - What to name a key after when the fragment has no name of
   * its own. The first site to carry a fragment names it.
   */
  public survey(value: T, site: string): void {
    if (this.#frozen) {
      throw new Error("The survey is closed. Call `survey` before `freeze`, not after.");
    }
    const identity = identityOf(value);
    const seen = this.#seen.get(identity);
    if (seen === undefined) {
      this.#seen.set(identity, { value, key: this.#policy.key(value, site), uses: 1 });
      return;
    }
    seen.uses += 1;
  }

  /** Closes the survey. Nothing is promoted before this runs. */
  public freeze(): void {
    this.#frozen = true;
  }

  /**
   * The component key for one fragment, or `undefined` when the site writes
   * the fragment itself.
   *
   * @param value - The lowered fragment
   * @returns The key, or `undefined` when this fragment stays in place
   */
  public keyFor(value: T): string | undefined {
    if (!this.#frozen) {
      throw new Error("The survey is open. Call `freeze` before reading a key.");
    }
    const seen = this.#seen.get(identityOf(value));
    if (seen === undefined) return undefined;
    if (this.#policy.when === "repeated" && seen.uses < 2) return undefined;
    return seen.key;
  }

  /**
   * The promoted fragments, keyed as they will be emitted.
   *
   * The order is the order the survey first met them. The survey walks the
   * resolved model, and every list in it is already in source order, so this
   * comes out in source order without a sort of its own.
   */
  public entries(): Map<string, T> {
    if (!this.#frozen) {
      throw new Error("The survey is open. Call `freeze` before reading the entries.");
    }
    const promoted = new Map<string, T>();
    for (const seen of this.#seen.values()) {
      if (this.#policy.when === "repeated" && seen.uses < 2) continue;
      promoted.set(seen.key, seen.value);
    }
    return promoted;
  }
}
