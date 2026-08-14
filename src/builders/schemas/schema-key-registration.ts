import { Type, Model, Enum, Union, Program } from "@typespec/compiler";
import { reportDiagnostic } from "../../lib.js";
import { declarationNameFor } from "./schema-naming.js";

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

  public constructor(private readonly program: Program) {}

  /**
   * Returns the `components.schemas` key for `type`. Registers the key on
   * first use. Reports `duplicate-schema-key` if a different type already
   * claimed this name. See the `schemaKeys`/`claimedBy` fields above for the
   * collision policy.
   */
  public keyFor(type: Model | Enum | Union): string {
    const cached = this.schemaKeys.get(type);
    if (cached !== undefined) {
      return cached;
    }
    const name = declarationNameFor(this.program, type);
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
