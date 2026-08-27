import { describe, it, expect } from "vitest";
import { Model } from "@typespec/compiler";
import { t } from "@typespec/compiler/testing";
import { buildDocSchema, compileSchemas } from "../../../utils/schema-host.js";
import { diagnosticsWith, findDiagnostic } from "../../../utils/diagnostics.js";
import { propertiesOf, schemaOf } from "../../../utils/document.js";
import { resolvedProperties } from "../../../utils/schema-host.js";

describe("Unit: Schemas — validation keywords and extensions", () => {
  it("merges two separate applications' key/value pairs alongside a model's own properties", async () => {
    const { builder, M } = await compileSchemas(t.code`
      @AsyncAPI.jsonSchemaExtension("unevaluatedProperties", false)
      @AsyncAPI.jsonSchemaExtension("propertyNames", #{ pattern: "^[a-z]+$" })
      model ${t.model("M")} {
        id: string;
      }
    `);
    builder.buildSchema(M);

    expect(builder.getSchemas().M).toEqual({
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      unevaluatedProperties: false,
      propertyNames: { pattern: "^[a-z]+$" },
    });
  });

  it("merges its key/value pair into a property's own schema entry", async () => {
    const { builder, M } = await compileSchemas(t.code`
      model ${t.model("M")} {
        @AsyncAPI.jsonSchemaExtension("deprecated", true)
        name: string;
      }
    `);
    builder.buildSchema(M);

    const props = resolvedProperties(builder, "M");
    expect(props.name).toEqual({ type: "string", deprecated: true });
  });

  it("leaves a model or property with no application completely unaffected", async () => {
    const { builder, M } = await compileSchemas(t.code`
      model ${t.model("M")} {
        name: string;
      }
    `);
    builder.buildSchema(M);

    expect(builder.getSchemas().M).toEqual({
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    });
  });

  it("lets an extension key override a keyword this emitter already produces for that model", async () => {
    const { builder, M } = await compileSchemas(t.code`
      @AsyncAPI.jsonSchemaExtension("type", "override")
      model ${t.model("M")} {
        name: string;
      }
    `);
    builder.buildSchema(M);

    const schema = builder.getSchemas().M;
    expect(schema.type).toBe("override");
  });

  it("should map @minLength/@maxLength on a property to minLength/maxLength", async () => {
    const { builder } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        @minLength(2)
        @maxLength(20)
        name: string;
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(props.name).toEqual({ type: "string", minLength: 2, maxLength: 20 });
  });

  it("should map @pattern on a property to pattern", async () => {
    const { builder } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        @pattern("^[a-z]+$")
        name: string;
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(props.name).toEqual({ type: "string", pattern: "^[a-z]+$" });
  });

  it("should map @format on a property to format", async () => {
    const { builder } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        @format("uuid")
        id: string;
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(props.id).toEqual({ type: "string", format: "uuid" });
  });

  it("should map @minLength/@maxLength/@pattern/@format on a scalar declaration", async () => {
    const { builder } = await buildDocSchema(t.code`
      @minLength(2)
      @maxLength(20)
      @pattern("^[a-z]+$")
      @format("uuid")
      scalar Username extends string;
      model ${t.model("M")} {
        name: Username;
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(props.name).toEqual({
      type: "string",
      minLength: 2,
      maxLength: 20,
      pattern: "^[a-z]+$",
      format: "uuid",
    });
  });

  it("should let a property's own @format override (not allOf-intersect with) a scalar's baked-in format", async () => {
    const { builder } = await buildDocSchema(t.code`
      @format("uuid")
      scalar Id extends string;
      model ${t.model("M")} {
        @format("uri")
        a: Id;
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(props.a).toEqual({ type: "string", format: "uri" });
  });

  it("should let a derived scalar's own @format override a built-in's baked-in format", async () => {
    const { builder } = await buildDocSchema(t.code`
      @format("uri-reference")
      scalar Rel extends url;
      model ${t.model("M")} {
        a: Rel;
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(props.a).toEqual({ type: "string", format: "uri-reference" });
  });

  it("should keep a scalar's inherited description at the property level when only an unrelated validation keyword collides", async () => {
    const { builder } = await buildDocSchema(t.code`
      @doc("A username")
      @minLength(5)
      scalar Username extends string;
      model ${t.model("M")} {
        @minLength(2)
        u: Username;
      }
    `);

    // The property says nothing of its own about the value, only constrains
    // it further, so it references the scalar's component. The hoist can
    // only carry what the `allOf` branch holds, and the branch is a
    // reference, so the scalar's own prose stays in its component rather
    // than being copied to the property.
    const props = resolvedProperties(builder, "M");
    expect(props.u).toEqual({
      allOf: [{ type: "string", minLength: 5, description: "A username" }],
      minLength: 2,
    });
  });

  it("should hoist title, examples and format above the allOf when a validation keyword collides", async () => {
    // The hoist carries every annotation above the `allOf`, not only the
    // description. `@summary` becomes `title` and `@example` becomes
    // `examples`. The other collision tests carry a description alone, so
    // the title, examples and format sides of the hoist never ran. This
    // input does not pin the order the wrapper merges `format` in. Only a
    // base that carries its own `format` can tell that order apart, and
    // this one does not. `@minLength` on the property collides with the
    // scalar's own `@minLength`, which is what routes this through the
    // hoist at all. The property's own `format` stays at the top level,
    // above the `allOf`, rather than being left inside the branch.
    const { builder } = await buildDocSchema(t.code`
      @minLength(5)
      scalar Key extends string;
      model ${t.model("M")} {
        @summary("The key")
        @example("abcdef")
        @format("uuid")
        @minLength(8)
        id: Key;
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(props.id).toEqual({
      allOf: [{ type: "string", minLength: 5 }],
      title: "The key",
      examples: ["abcdef"],
      minLength: 8,
      format: "uuid",
    });
  });

  it("should drop the base's format from the allOf branch when this level states one of its own", async () => {
    // Two formats on one value contradict each other; `format` is an
    // annotation, not a keyword that intersects. Leaving the base's inside
    // the branch while writing this level's above it says the value is a
    // uuid and an email at once.
    const { builder } = await buildDocSchema(t.code`
      @format("uuid")
      @minLength(5)
      scalar Key extends string;
      model ${t.model("M")} {
        @format("email")
        @minLength(8)
        id: Key;
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(props.id).toEqual({
      allOf: [{ type: "string", minLength: 5 }],
      minLength: 8,
      format: "email",
    });
  });

  it("should drop the base scalar's format when a derived scalar states one of its own", async () => {
    const { builder } = await buildDocSchema(t.code`
      @format("uuid")
      @minLength(5)
      scalar Tight extends string;
      @format("email")
      @minLength(2)
      scalar Loose extends Tight;
      model ${t.model("M")} {
        v: Loose;
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(props.v).toEqual({
      allOf: [{ type: "string", minLength: 5 }],
      minLength: 2,
      format: "email",
    });
  });

  it("should keep an inherited scalar description at the top level when a derived scalar's own validation keyword collides", async () => {
    const { builder } = await buildDocSchema(t.code`
      @doc("Tight")
      @minLength(5)
      scalar Tight extends string;
      @minLength(2)
      scalar Loose extends Tight;
      model ${t.model("M")} {
        v: Loose;
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(props.v).toEqual({
      allOf: [{ type: "string", minLength: 5 }],
      description: "Tight",
      minLength: 2,
    });
  });

  it("should map @minValue/@maxValue on a property to minimum/maximum", async () => {
    const { builder } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        @minValue(18)
        @maxValue(200)
        age: int32;
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(props.age).toEqual({ type: "integer", format: "int32", minimum: 18, maximum: 200 });
  });

  it("should map @minValueExclusive/@maxValueExclusive on a property to exclusiveMinimum/exclusiveMaximum", async () => {
    const { builder } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        @minValueExclusive(0)
        @maxValueExclusive(50)
        distance: float64;
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(props.distance).toEqual({
      type: "number",
      format: "double",
      exclusiveMinimum: 0,
      exclusiveMaximum: 50,
    });
  });

  it("should map @minValue/@maxValue on a numeric scalar declaration to minimum/maximum", async () => {
    const { builder } = await buildDocSchema(t.code`
      @minValue(18)
      @maxValue(200)
      scalar Age extends int32;
      model ${t.model("M")} {
        age: Age;
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(props.age).toEqual({ type: "integer", format: "int32", minimum: 18, maximum: 200 });
  });

  it("should map @minItems/@maxItems on a property to minItems/maxItems", async () => {
    const { builder } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        @minItems(1)
        @maxItems(5)
        tags: string[];
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(props.tags).toEqual({
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 5,
    });
  });

  it("should map @minItems/@maxItems on a named array alias model to minItems/maxItems", async () => {
    const { builder } = await buildDocSchema(t.code`
      @minItems(1)
      @maxItems(5)
      model Endpoints is string[];
      model ${t.model("M")} {
        endpoints: Endpoints;
      }
    `);

    expect(builder.getSchemas().Endpoints).toEqual({
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 5,
    });
  });

  it("should wrap a $ref'd property's own minItems in allOf rather than dropping it", async () => {
    const { builder } = await buildDocSchema(t.code`
      model Endpoints is string[];
      model ${t.model("M")} {
        @minItems(1)
        endpoints: Endpoints;
      }
    `);

    const props = propertiesOf(builder.getSchemas().M);
    expect(props.endpoints).toEqual({
      allOf: [{ $ref: "#/components/schemas/Endpoints" }],
      minItems: 1,
    });
  });

  it("should carry a base scalar's @minLength through more than one level of derivation", async () => {
    const { builder } = await buildDocSchema(t.code`
      @minLength(2)
      scalar Email extends string;
      scalar WorkEmail extends Email;
      model ${t.model("M")} {
        a: WorkEmail;
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(props.a).toEqual({ type: "string", minLength: 2 });
  });

  it("should intersect (not silently drop) a base scalar's own @minLength/@pattern when a derived scalar declares a weaker one", async () => {
    const { builder } = await buildDocSchema(t.code`
      @minLength(5)
      @pattern("^[a-z]+$")
      scalar Tight extends string;
      @minLength(2)
      scalar Loose extends Tight;
      model ${t.model("M")} {
        v: Loose;
      }
    `);

    const props = resolvedProperties(builder, "M");
    // Tight's stricter minLength(5)/pattern must still be enforced
    // alongside Loose's own (weaker) minLength(2). Losing them would let
    // "ab" validate, even though Tight forbids it.
    expect(props.v).toEqual({
      allOf: [{ type: "string", minLength: 5, pattern: "^[a-z]+$" }],
      minLength: 2,
    });
  });

  it("should intersect a numeric base scalar's @minValue with a derived scalar's weaker @minValue", async () => {
    const { builder } = await buildDocSchema(t.code`
      @minValue(10)
      scalar Age extends int32;
      @minValue(1)
      scalar YoungAge extends Age;
      model ${t.model("M")} {
        v: YoungAge;
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(props.v).toEqual({
      allOf: [{ type: "integer", format: "int32", minimum: 10 }],
      minimum: 1,
    });
  });

  it("should let a property's own @minLength override its scalar's @minLength", async () => {
    const { builder } = await buildDocSchema(t.code`
      @minLength(2)
      scalar Username extends string;
      model ${t.model("M")} {
        @minLength(5)
        name: Username;
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(props.name).toEqual({
      allOf: [{ type: "string", minLength: 2 }],
      minLength: 5,
    });
  });

  it("should intersect (not silently drop) a scalar's own @minLength/@pattern when the property declares a weaker one", async () => {
    const { builder } = await buildDocSchema(t.code`
      @minLength(5)
      @pattern("^[a-z]+$")
      scalar Username extends string;
      model ${t.model("M")} {
        @minLength(2)
        @pattern("^.*$")
        name: Username;
      }
    `);

    const props = resolvedProperties(builder, "M");
    // The scalar's own (stricter) constraints must still be enforced
    // alongside the property's own (weaker) ones. Losing them would let
    // `"AB"` validate, even though `Username` forbids it.
    expect(props.name).toEqual({
      allOf: [{ type: "string", minLength: 5, pattern: "^[a-z]+$" }],
      minLength: 2,
      pattern: "^.*$",
    });
  });

  it("should let a property's own @doc replace (not merge with) the scalar's @doc even when a validation keyword collides", async () => {
    const { builder } = await buildDocSchema(t.code`
      @doc("scalar doc")
      @minLength(5)
      scalar Username extends string;
      model ${t.model("M")} {
        @doc("prop doc")
        @minLength(2)
        u: Username;
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(props.u).toEqual({
      allOf: [{ type: "string", minLength: 5 }],
      description: "prop doc",
      minLength: 2,
    });
  });

  it("should report a diagnostic instead of silently dropping an unrepresentable @maxValue on int64", async () => {
    const { builder, program } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        @minValue(-9223372036854775808)
        @maxValue(9223372036854775807)
        v: int64;
      }
    `);

    const props = resolvedProperties(builder, "M");
    // The exact bound cannot be represented as a JS number, so it is not
    // emitted as `minimum`/`maximum`. But the drop must be diagnosed.
    expect(schemaOf(props.v).minimum).toBeUndefined();
    expect(schemaOf(props.v).maximum).toBeUndefined();
    expect(
      diagnosticsWith(program.diagnostics, "unrepresentable-numeric-constraint").length,
    ).toBeGreaterThan(0);
  });

  it("should report a diagnostic instead of silently dropping a temporal @minValue", async () => {
    const { builder, program } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        @minValue(utcDateTime.fromISO("2020-01-01T00:00:00Z"))
        at: utcDateTime;
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(props.at).toEqual({ type: "string", format: "date-time" });
    expect(
      diagnosticsWith(program.diagnostics, "unsupported-temporal-range-constraint").length,
    ).toBeGreaterThan(0);
  });

  it("should apply an augment @@minLength on a built-in scalar", async () => {
    const { builder } = await buildDocSchema(t.code`
      @@minLength(TypeSpec.string, 3);
      model ${t.model("M")} {
        v: string;
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(props.v).toEqual({ type: "string", minLength: 3 });
  });

  it("should report a diagnostic instead of silently dropping an unrepresentable @maxLength", async () => {
    const { builder, program } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        @maxLength(99999999999999999999)
        name: string;
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(schemaOf(props.name).maxLength).toBeUndefined();
    expect(
      diagnosticsWith(program.diagnostics, "unrepresentable-numeric-constraint").length,
    ).toBeGreaterThan(0);
  });

  it("should report a diagnostic instead of silently dropping an unrepresentable @minItems", async () => {
    const { builder, program } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        @minItems(99999999999999999999)
        tags: string[];
      }
    `);

    const props = resolvedProperties(builder, "M");
    expect(schemaOf(props.tags).minItems).toBeUndefined();
    expect(
      diagnosticsWith(program.diagnostics, "unrepresentable-numeric-constraint").length,
    ).toBeGreaterThan(0);
  });

  it("should report a scalar's constraint diagnostic only once even when used by multiple properties", async () => {
    const { program } = await buildDocSchema(t.code`
      @maxValue(9223372036854775807)
      scalar Big extends int64;
      model ${t.model("M")} {
        a: Big;
        b: Big;
        c: Big;
      }
    `);

    const occurrences = diagnosticsWith(program.diagnostics, "unrepresentable-numeric-constraint");
    expect(occurrences).toHaveLength(1);
  });

  it("should name the actual decorator (not the @minValue family) in an unrepresentable @maxLength/@maxItems diagnostic", async () => {
    const { program: lengthProgram } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        @maxLength(99999999999999999999)
        name: string;
      }
    `);
    const lengthMessage = findDiagnostic(
      lengthProgram.diagnostics,
      "unrepresentable-numeric-constraint",
    ).message;
    expect(lengthMessage).toContain("maxLength");

    const { program: itemsProgram } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        @maxItems(99999999999999999999)
        tags: string[];
      }
    `);
    const itemsMessage = findDiagnostic(
      itemsProgram.diagnostics,
      "unrepresentable-numeric-constraint",
    ).message;
    expect(itemsMessage).toContain("maxItems");
  });

  it("should report a separate diagnostic for each of two independently-overflowing constraints on the same property", async () => {
    const { program } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        @minLength(99999999999999999999)
        @maxLength(99999999999999999999)
        name: string;
      }
    `);

    const occurrences = diagnosticsWith(program.diagnostics, "unrepresentable-numeric-constraint");
    expect(occurrences).toHaveLength(2);
  });

  it("keeps a generic model property's validation decorator on every instantiation", async () => {
    // `@minLength` is declared once, on `Wrapper<T>`'s own `label`
    // property. TypeSpec's instantiation semantics copy the type
    // definition, so each instantiation's built schema must keep it too.
    const { builder, W } = await compileSchemas(t.code`
      model Wrapper<T> {
        @minLength(3)
        label: string;
        data: T;
      }
      model Order { id: string; }
      model Product { sku: string; }
      @test("W")
      model W {
        order: Wrapper<Order>;
        product: Wrapper<Product>;
      }
    `);
    builder.buildSchema(W as Model);
    const components = builder.getSchemas();

    expect(propertiesOf(components.WrapperOrder).label).toEqual({
      type: "string",
      minLength: 3,
    });
    expect(propertiesOf(components.WrapperProduct).label).toEqual({
      type: "string",
      minLength: 3,
    });
  });
});
