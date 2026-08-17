/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect } from "vitest";
import { Ajv } from "ajv";
import { compileSchemas } from "../../utils/schema-host.js";
import { t } from "@typespec/compiler/testing";

/**
 * `@discriminated` states the shape a union travels in, not only the set of
 * types it can hold.
 *
 * The default envelope puts every variant inside a two-property object, so
 * `{ "kind": "cat", "value": { "meow": true } }` is what a producer sends. A
 * schema that lists the variants directly describes a shape one level
 * flatter, and every real message fails against it. The validator cases below
 * are what prove the difference, rather than only comparing object shapes.
 */
describe("Unit: Schemas — @discriminated unions", () => {
  async function schemasFor(body: string): Promise<Record<string, any>> {
    const { builder, M } = await compileSchemas(t.code`
      ${body}
      model ${t.model("M")} {
        pet: Pet;
      }
    `);
    builder.buildSchema(M);
    return builder.getSchemas();
  }

  /** Compiles the components into a real draft-07 validator for `Pet`. */
  function validatorFor(components: Record<string, any>) {
    const ajv = new Ajv({ strict: false });
    for (const [key, schema] of Object.entries(components)) {
      ajv.addSchema(schema as object, `#/components/schemas/${key}`);
    }
    const validate = ajv.getSchema("#/components/schemas/Pet");
    if (validate === undefined) {
      throw new Error("Pet schema was not registered");
    }
    return validate;
  }

  const ENVELOPED = `
    @discriminated union Pet { cat: Cat, dog: Dog }
    model Cat { meow: boolean }
    model Dog { bark: boolean }
  `;

  it("wraps each variant in the default envelope", async () => {
    const components = await schemasFor(ENVELOPED);

    expect(components.Pet).toEqual({
      type: "object",
      oneOf: [
        {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["cat"] },
            value: { $ref: "#/components/schemas/Cat" },
          },
          required: ["kind", "value"],
        },
        {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["dog"] },
            value: { $ref: "#/components/schemas/Dog" },
          },
          required: ["kind", "value"],
        },
      ],
      discriminator: "kind",
    });
  });

  it("accepts the message shape the compiler documents", async () => {
    const validate = validatorFor(await schemasFor(ENVELOPED));

    // This is the exact shape `@discriminated`'s own documentation shows.
    expect(validate({ kind: "cat", value: { meow: true } })).toBe(true);
    expect(validate({ kind: "dog", value: { bark: false } })).toBe(true);
  });

  it("rejects a bare variant sent without its envelope", async () => {
    const validate = validatorFor(await schemasFor(ENVELOPED));

    // A schema built from the variants alone would accept this and reject
    // the enveloped form above. That is the defect this test pins down.
    expect(validate({ meow: true })).toBe(false);
  });

  it("rejects an envelope whose discriminator names the wrong variant", async () => {
    const validate = validatorFor(await schemasFor(ENVELOPED));

    // `kind` has to agree with what `value` holds. Without the per-branch
    // `enum`, both branches would accept this.
    expect(validate({ kind: "cat", value: { bark: true } })).toBe(false);
  });

  it("rejects an envelope missing its discriminator", async () => {
    const validate = validatorFor(await schemasFor(ENVELOPED));

    expect(validate({ value: { meow: true } })).toBe(false);
  });

  it("references the variants directly when the envelope is none", async () => {
    const components = await schemasFor(`
      @discriminated(#{envelope: "none"})
      union Pet { cat: Cat, dog: Dog }
      model Cat { kind: "cat", meow: boolean }
      model Dog { kind: "dog", bark: boolean }
    `);

    // With no envelope the discriminating property lives inside each variant,
    // so there is nothing to wrap.
    expect(components.Pet).toEqual({
      type: "object",
      oneOf: [{ $ref: "#/components/schemas/Cat" }, { $ref: "#/components/schemas/Dog" }],
      discriminator: "kind",
    });
  });

  it("accepts a flat variant when the envelope is none", async () => {
    const validate = validatorFor(
      await schemasFor(`
        @discriminated(#{envelope: "none"})
        union Pet { cat: Cat, dog: Dog }
        model Cat { kind: "cat", meow: boolean }
        model Dog { kind: "dog", bark: boolean }
      `),
    );

    expect(validate({ kind: "cat", meow: true })).toBe(true);
    // The enveloped shape is wrong for this union, and has to be rejected.
    expect(validate({ kind: "cat", value: { meow: true } })).toBe(false);
  });

  it("honours custom discriminator and envelope property names", async () => {
    const components = await schemasFor(`
      @discriminated(#{discriminatorPropertyName: "dataKind", envelopePropertyName: "data"})
      union Pet { cat: Cat, dog: Dog }
      model Cat { meow: boolean }
      model Dog { bark: boolean }
    `);

    expect(components.Pet.discriminator).toBe("dataKind");
    expect(components.Pet.oneOf[0].properties.dataKind).toEqual({
      type: "string",
      enum: ["cat"],
    });
    expect(components.Pet.oneOf[0].properties.data).toEqual({
      $ref: "#/components/schemas/Cat",
    });
    expect(components.Pet.oneOf[0].required).toEqual(["dataKind", "data"]);
  });

  it("accepts a message using custom property names", async () => {
    const validate = validatorFor(
      await schemasFor(`
        @discriminated(#{discriminatorPropertyName: "dataKind", envelopePropertyName: "data"})
        union Pet { cat: Cat, dog: Dog }
        model Cat { meow: boolean }
        model Dog { bark: boolean }
      `),
    );

    expect(validate({ dataKind: "cat", data: { meow: true } })).toBe(true);
    expect(validate({ kind: "cat", value: { meow: true } })).toBe(false);
  });

  it("leaves a union with no @discriminated as a plain anyOf", async () => {
    const components = await schemasFor(`
      union Pet { cat: Cat, dog: Dog }
      model Cat { meow: boolean }
      model Dog { bark: boolean }
    `);

    // The envelope is opt-in. A union without the decorator keeps describing
    // exactly the variants it holds.
    expect(components.Pet).toEqual({
      anyOf: [{ $ref: "#/components/schemas/Cat" }, { $ref: "#/components/schemas/Dog" }],
    });
  });

  it("keeps the union's own documentation alongside the envelope", async () => {
    const components = await schemasFor(`
      /** Any pet the system knows about. */
      @discriminated union Pet { cat: Cat, dog: Dog }
      model Cat { meow: boolean }
      model Dog { bark: boolean }
    `);

    expect(components.Pet.description).toBe("Any pet the system knows about.");
    expect(components.Pet.discriminator).toBe("kind");
  });
});
