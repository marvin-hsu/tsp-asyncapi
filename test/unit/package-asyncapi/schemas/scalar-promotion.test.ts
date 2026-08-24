import { describe, expect, it } from "vitest";
import { t } from "@typespec/compiler/testing";
import { buildDocSchema } from "../../../utils/schema-host.js";
import { propertiesOf } from "../../../utils/document.js";

/**
 * Where a user-declared scalar is written.
 *
 * A scalar the author declared is a named declaration, so it earns a
 * `components.schemas` entry and every use site writes a reference. This is
 * the rule every other named declaration already follows, and the one
 * `@typespec/openapi3` follows for a scalar.
 *
 * What a scalar *says* — how a chain merges, which keyword wins — is pinned
 * in the suites beside this one, which read through `resolvedProperties` so
 * they never restate this rule.
 */
describe("Unit: promoting user scalars into components", () => {
  it("writes one component and a reference from every use site", async () => {
    const { builder } = await buildDocSchema(t.code`
      @maxLength(254)
      scalar Email extends string;
      model ${t.model("M")} {
        primary: Email;
        billing: Email;
      }
    `);

    expect(builder.getSchemas().Email).toEqual({ type: "string", maxLength: 254 });
    const props = propertiesOf(builder.getSchemas().M);
    const reference = { $ref: "#/components/schemas/Email" };
    expect(props.primary).toEqual(reference);
    expect(props.billing).toEqual(reference);
  });

  /** A built-in has no name of the author's own, so it stays in place. */
  it("leaves a built-in scalar inline", async () => {
    const { builder } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        id: string;
      }
    `);

    expect(propertiesOf(builder.getSchemas().M).id).toEqual({ type: "string" });
    expect(builder.getSchemas().string).toBeUndefined();
  });

  /**
   * A derived scalar is its own declaration. Flattening it into its base
   * would lose the name the author gave it.
   */
  it("gives a derived scalar a component of its own", async () => {
    const { builder } = await buildDocSchema(t.code`
      @maxLength(254)
      scalar Email extends string;
      scalar WorkEmail extends Email;
      model ${t.model("M")} {
        work: WorkEmail;
      }
    `);

    const schemas = builder.getSchemas();
    expect(Object.keys(schemas).sort((a, b) => a.localeCompare(b))).toEqual(["M", "WorkEmail"]);
    expect(schemas.WorkEmail).toEqual({ type: "string", maxLength: 254 });
    expect(propertiesOf(schemas.M).work).toEqual({ $ref: "#/components/schemas/WorkEmail" });
  });

  /**
   * A property that only constrains the value further still references: two
   * `maxLength` on one value is an intersection, which is what `allOf`
   * means.
   */
  it("references from a property that only adds a constraint", async () => {
    const { builder } = await buildDocSchema(t.code`
      @maxLength(254)
      scalar Email extends string;
      model ${t.model("M")} {
        @maxLength(64)
        short: Email;
      }
    `);

    expect(propertiesOf(builder.getSchemas().M).short).toEqual({
      allOf: [{ $ref: "#/components/schemas/Email" }],
      maxLength: 64,
    });
  });

  /**
   * A property that says something of its own about the value writes the
   * scalar in place. Its prose, format and encoding replace what the scalar
   * says, and a reference cannot take the scalar's own text away.
   */
  it("writes the scalar in place under a property that speaks for itself", async () => {
    const { builder } = await buildDocSchema(t.code`
      @doc("An RFC 5321 mailbox address.")
      scalar Email extends string;
      model ${t.model("M")} {
        /** Where the receipt goes. */
        receipt: Email;
      }
    `);

    expect(propertiesOf(builder.getSchemas().M).receipt).toEqual({
      type: "string",
      description: "Where the receipt goes.",
    });
    expect(builder.getSchemas().Email).toBeUndefined();
  });
});
