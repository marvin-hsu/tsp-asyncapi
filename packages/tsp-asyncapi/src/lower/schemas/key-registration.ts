import { Type, Model, Enum, Scalar, Union, Program, compilerAssert } from "@typespec/compiler";
import { reportDiagnostic, declarationNameFor, fallbackDeclarationName } from "tsp-asyncapi-core";

/**
 * Assigns and owns every `components.schemas` key for one emit.
 *
 * A name collision is a hard error, `duplicate-schema-key`. The registry
 * never renames a colliding type to make it fit, matching
 * `@typespec/openapi`'s own `duplicate-type-name` diagnostic.
 */

/**
 * Why a key belongs to no type the author wrote.
 *
 * A collision on such a key names the message it was derived from, and the
 * advice depends on why that message needed a key of its own.
 */
type DerivedKeyCause = "payload" | "raw";

/** The diagnostic each cause reports. */
const CAUSE_CODE = {
  payload: "payload-schema-key-taken",
  raw: "raw-schema-key-taken",
} as const;

/** A derived key, and the message that needed it. */
interface DerivedKey {
  readonly target: Model;
  readonly cause: DerivedKeyCause;
}

export class SchemaKeyRegistry {
  private readonly schemaKeys = new Map<Type, string>();
  private readonly claimedBy = new Map<string, Type>();
  // Keys claimed through `claimDerived` rather than by a type of their own,
  // mapped to the message model they were derived from. A collision on such
  // a key has a cause the generic message cannot name: the author wrote no
  // second type with that name. So the report needs the message.
  private readonly derivedFrom = new Map<string, DerivedKey>();
  // Memoizes each type's computed name, including the `undefined` an
  // unspeakable template instantiation resolves to. `declarationNameFor`
  // walks a template argument chain recursively, and every caller asks for
  // the same type's name more than once. So the walk must run once per type,
  // not once per question.
  private readonly names = new Map<Type, string | undefined>();

  public constructor(private readonly program: Program) {}

  /**
   * Returns the compact name `type` would be keyed by, without registering
   * anything. Returns `undefined` when `type` is unspeakable: a template
   * instantiation with an argument that has no fixed identity of its own.
   */
  public nameFor(type: Model | Enum | Scalar | Union): string | undefined {
    if (this.names.has(type)) {
      return this.names.get(type);
    }
    const name = declarationNameFor(this.program, type);
    this.names.set(type, name);
    return name;
  }

  /**
   * Returns the key `type` would claim, without registering it or
   * reporting a collision: `nameFor`'s compact name, or the long fallback
   * name, exactly as `keyFor` settles on. Lets a caller compare two types
   * by the component they would share before deciding a collision is real.
   */
  public candidateFor(type: Model | Union): string {
    return this.nameFor(type) ?? fallbackDeclarationName(this.program, type);
  }

  /**
   * Returns the `components.schemas` key for `type`, registering it on
   * first use. Reports `duplicate-schema-key` if a different type already
   * claimed this name. An unspeakable `type` (see `nameFor`) falls back to
   * `fallbackDeclarationName`, reached only when the caller cannot inline
   * the type, so the long fallback key never displaces a compact one.
   */
  public keyFor(type: Model | Enum | Scalar | Union): string {
    const cached = this.schemaKeys.get(type);
    if (cached !== undefined) {
      return cached;
    }
    let name = this.nameFor(type);
    if (name === undefined) {
      // Only a `Model`/`Union` template instantiation can be unspeakable.
      // Neither an `Enum` nor a `Scalar` takes template arguments, so each
      // always has a name.
      compilerAssert(
        type.kind !== "Enum" && type.kind !== "Scalar",
        `Unspeakable declaration name for a '${type.kind}' reached key registration.`,
        type,
      );
      name = this.candidateFor(type);
    }
    this.schemaKeys.set(type, name);
    const owner = this.claimedBy.get(name);
    if (owner === undefined) {
      this.claimedBy.set(name, type);
    } else if (owner !== type) {
      this.reportCollision(name, type);
    }
    return name;
  }

  /**
   * Claims a key that no type owns, on behalf of `target`.
   *
   * A message that lifts `@header` fields needs a payload schema its own
   * model does not describe, registered under a key derived from the
   * model's. The author may still have declared an unrelated model whose
   * own name lands on that key, so routing the claim through here puts it
   * under the same collision rule as every other key, instead of one
   * schema quietly replacing the other.
   *
   * A key `target` already owns is claimed again without a report,
   * mirroring `keyFor`: a second caller for the same message gets the same
   * answer instead of a diagnostic about a clash with itself.
   *
   * @param key - The derived key
   * @param target - The message model the key is derived from
   * @returns True when the key was free
   */
  public claimDerived(key: string, target: Model, cause: DerivedKeyCause = "payload"): boolean {
    const owner = this.claimedBy.get(key);
    if (owner !== undefined && owner !== target) {
      reportDiagnostic(this.program, {
        code: CAUSE_CODE[cause],
        target,
        format: { name: key, message: target.name },
      });
      return false;
    }
    this.claimedBy.set(key, target);
    this.derivedFrom.set(key, { target, cause });
    return true;
  }

  /**
   * Reports one key collision, naming the cause the user can act on.
   *
   * A key `claimDerived` produced belongs to no type the author wrote, so a
   * generic "duplicate schema name" would send the author looking for a
   * declaration that does not exist. Such a collision instead names the
   * message the key was derived from.
   */
  private reportCollision(key: string, target: Type): void {
    const derived = this.derivedFrom.get(key);
    if (derived !== undefined) {
      reportDiagnostic(this.program, {
        code: CAUSE_CODE[derived.cause],
        target,
        format: { name: key, message: derived.target.name },
      });
      return;
    }
    reportDiagnostic(this.program, {
      code: "duplicate-schema-key",
      target,
      format: { name: key },
    });
  }

  /**
   * Returns the type that currently owns `key`, or `undefined`. Lets a
   * caller check whether a key built for another Components Object
   * section, such as `components.messages`, already names a different
   * type's schema.
   */
  public ownerOf(key: string): Type | undefined {
    return this.claimedBy.get(key);
  }

  /**
   * Releases the key claimed by `type`, if any. Call this when building
   * that type's schema body fails partway through, so a failed build does
   * not leave a `$ref` pointing at a reserved key with no matching schema.
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
