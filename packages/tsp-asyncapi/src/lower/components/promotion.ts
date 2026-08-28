/**
 * Deciding which fragments earn a place in `components`.
 *
 * A fragment is a piece of the document more than one place can carry: a
 * Bindings Object, a Tag Object, an External Documentation Object. Two
 * places carrying the same one would repeat it in the document; `components`
 * plus a `$ref` says it once.
 *
 * A named TypeSpec declaration promotes on its first use, the same rule
 * `SchemaBuilder` and `@typespec/openapi3` both follow. A Bindings Object, an
 * External Documentation Object, and a Correlation ID Object carry no such
 * name: their `valueof` values give this emitter no way to tell one written
 * in place from one assigned to a constant. So those promote only on a
 * second use, once sharing actually saves something.
 *
 * `SchemaBuilder` promotes by rewriting the object it already emitted,
 * because which schemas exist is unknowable until its walk finishes. This
 * file surveys first and writes second instead: the resolved model holds
 * every server, channel, operation, and message before the first byte is
 * written, so nothing here needs to mutate an object a caller already holds.
 */

/** How one kind of fragment earns a place in `components`. */
export interface PromotionPolicy<T> {
  /**
   * When a fragment earns a key, and what counts as the same fragment.
   *
   * `"named"` promotes on the first use, because the author named the thing
   * inside the fragment. A Tag Object is this: its `name` is a member, so
   * two tags of different names are already two fragments.
   *
   * `"keyed"` also promotes on the first use, but the name lives outside the
   * fragment: the author wrote it as the map key the fragment sits under. A
   * Parameter Object with no fields is `{}` regardless of its name, so the
   * key joins the identity. Otherwise a channel's `{tenant}` could point at
   * a component named after some other channel's `{region}`.
   *
   * `"repeated"` waits for the second use, because nothing named it and one
   * use has nothing to share with.
   */
  readonly when: "named" | "keyed" | "repeated";
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
 *
 * @param value - The value to inspect
 */
function identityOf(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return item;
    const entries = Object.entries(item as Record<string, unknown>);
    // `localeCompare`, not `<`: only stability matters here, and this
    // repo's lint rules require locale-aware string comparison anyway.
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
  readonly #contested = new Set<string>();
  /**
   * The identity of each fragment object already read.
   *
   * Every fragment is asked about at least twice: once by the survey, once
   * by the site reading its key back. Caching here means the second walk
   * reuses the first one's answer instead of repeating it.
   */
  readonly #identities = new WeakMap<object, string>();
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
    const key = this.#policy.key(value, site);
    const identity = this.#identity(value, key);
    const seen = this.#seen.get(identity);
    if (seen === undefined) {
      this.#seen.set(identity, { value, key, uses: 1 });
      return;
    }
    seen.uses += 1;
  }

  /**
   * Closes the survey. Nothing is promoted before this runs.
   *
   * Two Tag Objects can share a name but differ in description: two
   * fragments by identity, one key by name. Neither promotes then, since
   * picking a winner would silently give one site the other's text.
   * `resolve/tags.ts` already reports the conflict it can see.
   */
  public freeze(): void {
    const claimed = new Set<string>();
    for (const seen of this.#seen.values()) {
      if (claimed.has(seen.key)) this.#contested.add(seen.key);
      claimed.add(seen.key);
    }
    this.#frozen = true;
  }

  /**
   * The component key for one fragment, or `undefined` when the site writes
   * the fragment itself.
   *
   * @param value - The lowered fragment
   * @param site - The site carrying it. A `"keyed"` fragment needs it,
   * because its name lives outside itself; the others ignore it.
   * @returns The key, or `undefined` when this fragment stays in place
   */
  public keyFor(value: T, site = ""): string | undefined {
    if (!this.#frozen) {
      throw new Error("The survey is open. Call `freeze` before reading a key.");
    }
    const seen = this.#seen.get(this.#identity(value, this.#policy.key(value, site)));
    return seen === undefined || !this.#promotes(seen) ? undefined : seen.key;
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
      if (this.#promotes(seen)) promoted.set(seen.key, seen.value);
    }
    return promoted;
  }

  /**
   * What makes two fragments the same one.
   *
   * A `"keyed"` fragment carries its name outside itself, so the key joins
   * the identity. A null byte separates the two halves: it cannot appear in
   * a key, so no key and content can spell another pair's identity.
   */
  #identity(value: T, key: string): string {
    const content = this.#content(value);
    return this.#policy.when === "keyed" ? `${key}\u0000${content}` : content;
  }

  /**
   * The canonical form of one fragment, read once per object.
   *
   * A fragment that is not an object cannot key the table, so it is walked
   * every time. Every section of `components` holds objects, so that branch
   * is the type system's rather than the document's.
   */
  #content(value: T): string {
    const held: unknown = value;
    if (held === null || typeof held !== "object") return identityOf(value);
    const known = this.#identities.get(held);
    if (known !== undefined) return known;
    const content = identityOf(value);
    this.#identities.set(held, content);
    return content;
  }

  /** Whether one sighting earns its key. */
  #promotes(seen: Sighting<T>): boolean {
    if (this.#contested.has(seen.key)) return false;
    return this.#policy.when !== "repeated" || seen.uses > 1;
  }
}
