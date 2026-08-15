import { Type, Model, Enum, Union, Program, compilerAssert } from "@typespec/compiler";
import { reportDiagnostic } from "../../lib.js";
import { declarationNameFor, fallbackDeclarationName } from "./schema-naming.js";

/**
 * Key-collision policy for `components.schemas`. A name collision reports
 * a hard diagnostic error (`duplicate-schema-key`). This registry does not
 * rename on collision. This matches `@typespec/openapi`'s own
 * `duplicate-type-name` diagnostic. This policy replaces an earlier
 * auto-qualify/numeric-suffix ladder.
 */
export class SchemaKeyRegistry {
  private readonly schemaKeys = new Map<Type, string>();
  private readonly claimedBy = new Map<string, Type>();
  // Memoizes each type's computed name, including the `undefined` an
  // unspeakable template instantiation resolves to. `declarationNameFor`
  // walks a template argument chain recursively, and every caller asks for
  // the same type's name more than once. So the walk must run once per type,
  // not once per question.
  private readonly names = new Map<Type, string | undefined>();

  public constructor(private readonly program: Program) {}

  /**
   * Returns the compact name `type` would be keyed by, without registering
   * anything.
   * Returns `undefined` when `type` is unspeakable: a template instantiation
   * with an argument that has no fixed identity of its own. The caller then
   * inlines the type, or keys it under `fallbackDeclarationName` when inlining
   * cannot express it.
   */
  public nameFor(type: Model | Enum | Union): string | undefined {
    if (this.names.has(type)) {
      return this.names.get(type);
    }
    const name = declarationNameFor(this.program, type);
    this.names.set(type, name);
    return name;
  }

  /**
   * Returns the key `type` would claim, without registering anything and
   * without reporting a collision.
   * This is `nameFor`'s compact name when there is one, and the long fallback
   * name otherwise. So it is exactly the name `keyFor` settles on.
   * A caller uses it to compare two types by the component they would share,
   * before deciding whether their collision on some other key is real.
   */
  public candidateFor(type: Model | Union): string {
    return this.nameFor(type) ?? fallbackDeclarationName(this.program, type);
  }

  /**
   * Returns the `components.schemas` key for `type`. Registers the key on
   * first use. Reports `duplicate-schema-key` if a different type already
   * claimed this name. See the `schemaKeys`/`claimedBy` fields above for the
   * collision policy.
   * An unspeakable `type`, one with no compact name (see `nameFor`), falls
   * back to `fallbackDeclarationName`. A caller reaches that path only when
   * it cannot inline the type, so the long fallback key never displaces a
   * compact one.
   */
  public keyFor(type: Model | Enum | Union): string {
    const cached = this.schemaKeys.get(type);
    if (cached !== undefined) {
      return cached;
    }
    let name = this.nameFor(type);
    if (name === undefined) {
      // Only a `Model`/`Union` template instantiation can be unspeakable.
      // An `Enum` takes no template arguments, so it always has a name.
      compilerAssert(
        type.kind !== "Enum",
        "Unspeakable declaration name for an 'Enum' reached key registration.",
        type,
      );
      name = this.candidateFor(type);
    }
    this.schemaKeys.set(type, name);
    const owner = this.claimedBy.get(name);
    if (owner === undefined) {
      this.claimedBy.set(name, type);
    } else if (owner !== type) {
      reportDiagnostic(this.program, {
        code: "duplicate-schema-key",
        target: type,
        format: { name },
      });
    }
    return name;
  }

  /**
   * Returns the type that currently owns `key`, or `undefined` when no type
   * claimed it.
   * A caller uses this to tell whether a key it built for another Components
   * Object section, such as `components.messages`, already names a different
   * type's schema.
   */
  public ownerOf(key: string): Type | undefined {
    return this.claimedBy.get(key);
  }

  /**
   * Releases the key claimed by `type`, if any.
   * Call this when building that type's schema body fails partway through.
   * This keeps a failed build from leaving a reserved key with no matching
   * schema. Otherwise, a `$ref` would point at nothing.
   */
  public release(type: Type): void {
    const key = this.schemaKeys.get(type);
    if (key === undefined) {
      return;
    }
    this.schemaKeys.delete(type);
    // Only clear the name -> type reservation if `type` still owns it.
    // A type that lost the collision (see `keyFor` above) never became the
    // owner. Releasing it must not evict whichever type actually owns the
    // name.
    if (this.claimedBy.get(key) === type) {
      this.claimedBy.delete(key);
    }
  }
}
