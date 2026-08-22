import { describe, it, expect, vi } from "vitest";
import { Model } from "@typespec/compiler";
import { AsyncAPITester } from "../../../src/testing/index.js";
import { t } from "@typespec/compiler/testing";
import { SchemaBuilder } from "../../../src/lower/schemas.js";
import { buildDocSchema, compileSchemas } from "../../utils/schema-host.js";
import { propertiesOf, schemaOf } from "../../utils/document.js";

describe("Unit: Schemas — documentation and examples", () => {
  it("should map a model's doc comment to description and @summary to title", async () => {
    const { builder } = await buildDocSchema(t.code`
      /** A widget model. */
      @summary("Widget")
      model ${t.model("M")} {
        field: string;
      }
    `);

    expect(builder.getSchemas().M.title).toBe("Widget");
    expect(builder.getSchemas().M.description).toBe("A widget model.");
  });

  it("should map a model's @example values to an examples array", async () => {
    const { builder } = await buildDocSchema(t.code`
      @example(#{ field: "hello" })
      model ${t.model("M")} {
        field: string;
      }
    `);

    expect(builder.getSchemas().M.examples).toEqual([{ field: "hello" }]);
  });

  it("should emit only the bare example value, dropping @example's title/description options (draft-07 `examples` has nowhere to hang them; deferred to Phase 3's message-level examples)", async () => {
    const { builder } = await buildDocSchema(t.code`
      @example(#{ field: "hello" }, #{ title: "A title", description: "A description" })
      model ${t.model("M")} {
        field: string;
      }
    `);

    expect(builder.getSchemas().M.examples).toEqual([{ field: "hello" }]);
    expect(builder.getSchemas().M.title).toBeUndefined();
    expect(builder.getSchemas().M.description).toBeUndefined();
  });

  it("should omit title/description/examples keys entirely when not given", async () => {
    const { builder } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        field: string;
      }
    `);

    const schema = builder.getSchemas().M;
    // `toBeUndefined` alone would also pass if the key were present with
    // an `undefined` value. That would serialize to `title: null` etc. in
    // YAML/JSON. Assert the key is genuinely absent instead.
    expect(Object.hasOwn(schema, "title")).toBe(false);
    expect(Object.hasOwn(schema, "description")).toBe(false);
    expect(Object.hasOwn(schema, "examples")).toBe(false);
  });

  it("should omit a property's title/description/examples keys entirely when not given", async () => {
    const { builder } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        field: string;
      }
    `);

    const field = schemaOf(propertiesOf(builder.getSchemas().M).field);
    expect(Object.hasOwn(field, "title")).toBe(false);
    expect(Object.hasOwn(field, "description")).toBe(false);
    expect(Object.hasOwn(field, "examples")).toBe(false);
  });

  it("should map an explicit @doc decorator to description", async () => {
    const { builder } = await buildDocSchema(t.code`
      @doc("A widget model, via decorator.")
      model ${t.model("M")} {
        field: string;
      }
    `);

    expect(builder.getSchemas().M.description).toBe("A widget model, via decorator.");
  });

  it("should map a property's doc comment to description and @summary to title", async () => {
    const { builder } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        /** The widget's name. */
        @summary("Name")
        field: string;
      }
    `);

    const props = propertiesOf(builder.getSchemas().M);
    expect(props.field).toEqual({
      type: "string",
      title: "Name",
      description: "The widget's name.",
    });
  });

  it("should map a property's @example values to an examples array", async () => {
    const { builder } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        @example("hello")
        field: string;
      }
    `);

    const props = propertiesOf(builder.getSchemas().M);
    expect(props.field).toEqual({ type: "string", examples: ["hello"] });
  });

  it("should wrap a $ref property in allOf to carry its own documentation", async () => {
    const { builder } = await buildDocSchema(t.code`
      model ${t.model("Widget")} {
        name: string;
      }
      model ${t.model("M")} {
        /** The referenced widget. */
        widget: Widget;
      }
    `);

    const props = propertiesOf(builder.getSchemas().M);
    expect(props.widget).toEqual({
      allOf: [{ $ref: "#/components/schemas/Widget" }],
      description: "The referenced widget.",
    });
  });

  it("should preserve multiple @example values in source order (model and property)", async () => {
    const { builder } = await buildDocSchema(t.code`
      @example(#{ field: "a" })
      @example(#{ field: "b" })
      model ${t.model("M")} {
        @example("x")
        @example("y")
        field: string;
      }
    `);

    expect(builder.getSchemas().M.examples).toEqual([{ field: "a" }, { field: "b" }]);
    const props = propertiesOf(builder.getSchemas().M);
    expect(schemaOf(props.field).examples).toEqual(["x", "y"]);
  });

  it("should not throw and should skip an example whose value cannot be serialized", async () => {
    const { builder, M } = await compileSchemas(t.code`
      scalar myDate extends utcDateTime {
        init fromEpoch(v: int64);
      }
      model ${t.model("M")} {
        @example(myDate.fromEpoch(0))
        d: myDate;
      }
    `);
    expect(() => builder.buildSchema(M)).not.toThrow();

    const props = propertiesOf(builder.getSchemas().M);
    expect(Object.hasOwn(props.d as object, "examples")).toBe(false);
  });

  it("should omit (not null-fill) an example that serializes to undefined", async () => {
    const { builder } = await buildDocSchema(t.code`
      scalar ipv4 extends string {
        init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
      }
      model ${t.model("M")} {
        @example(ipv4.fromBytes(1, 2, 3, 4))
        ip: ipv4;
      }
    `);

    const props = propertiesOf(builder.getSchemas().M);
    expect(props.ip).toEqual({ type: "string" });
  });

  it("should omit examples entirely when an array element cannot be serialized", async () => {
    const { builder } = await buildDocSchema(t.code`
      scalar ipv4 extends string {
        init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
      }
      model ${t.model("M")} {
        @example(#[ipv4.fromBytes(1, 2, 3, 4)])
        ips: ipv4[];
      }
    `);

    const props = propertiesOf(builder.getSchemas().M);
    expect(props.ips).toEqual({ type: "array", items: { type: "string" } });
  });

  it("should omit examples entirely when an object property cannot be serialized, and report a diagnostic instead of dropping it silently", async () => {
    const { builder, program } = await buildDocSchema(t.code`
      scalar ipv4 extends string {
        init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
      }
      @example(#{ ip: ipv4.fromBytes(1, 2, 3, 4), name: "x" })
      model ${t.model("M")} {
        ip: ipv4;
        name: string;
      }
    `);

    expect(Object.hasOwn(builder.getSchemas().M, "examples")).toBe(false);
    // The whole example is dropped (even the sibling `name` field, which
    // was itself perfectly serializable) -- that must not happen in total
    // silence.
    expect(program.diagnostics).toHaveLength(1);
    expect(program.diagnostics[0].code).toBe("tsp-asyncapi/unserializable-example");
    expect(program.diagnostics[0].severity).toBe("warning");
  });

  it("should apply a named scalar's own @summary/@doc at its use site", async () => {
    const { builder } = await buildDocSchema(t.code`
      /** An email address. */
      @summary("Email")
      scalar Email extends string;
      model ${t.model("M")} {
        e: Email;
      }
    `);

    const props = propertiesOf(builder.getSchemas().M);
    expect(props.e).toEqual({
      type: "string",
      title: "Email",
      description: "An email address.",
    });
  });

  it("should not mix a property's own title with an inherited scalar description", async () => {
    const { builder } = await buildDocSchema(t.code`
      /** email doc */
      @summary("EmailTitle")
      scalar Email extends string;
      model ${t.model("M")} {
        @summary("PropTitle")
        e: Email;
      }
    `);

    const props = propertiesOf(builder.getSchemas().M);
    expect(props.e).toEqual({ type: "string", title: "PropTitle" });
  });

  it("should not surface a built-in scalar's own standard-library doc comment", async () => {
    const { builder } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        field: string;
      }
    `);

    const props = propertiesOf(builder.getSchemas().M);
    expect(props.field).toEqual({ type: "string" });
  });

  it("should encode a property's schema and its @example the same way", async () => {
    const { builder } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        @encode("unixTimestamp", int32)
        @example(utcDateTime.fromISO("2020-01-01T00:00:00Z"))
        ts: utcDateTime;
      }
    `);

    const props = propertiesOf(builder.getSchemas().M);
    // `@encode` says this moment travels as an integer count of seconds. The
    // schema has to say so, or a valid message fails to validate against it.
    expect(schemaOf(props.ts).type).toBe("integer");
    expect(schemaOf(props.ts).format).toBe("unixtime");
    // The example has to be encoded the same way. An example encoded one way
    // and described the other would not validate against its own schema.
    expect(schemaOf(props.ts).examples).toEqual([1577836800]);
  });

  it("should keep an inherited scalar's title/description when a property only adds its own @example", async () => {
    const { builder } = await buildDocSchema(t.code`
      /** An email address. */
      @summary("Email")
      scalar Email extends string;
      model ${t.model("M")} {
        @example("a@b.com")
        e: Email;
      }
    `);

    const props = propertiesOf(builder.getSchemas().M);
    expect(props.e).toEqual({
      type: "string",
      title: "Email",
      description: "An email address.",
      examples: ["a@b.com"],
    });
  });

  it("should map property names through @encodedName when serializing an @example (regression: schema/example key mismatch)", async () => {
    const { builder } = await buildDocSchema(t.code`
      @example(#{ userName: "bob" })
      model ${t.model("M")} {
        @encodedName("application/json", "user_name")
        userName: string;
      }
    `);

    const schema = builder.getSchemas().M;
    const properties = propertiesOf(schema);
    expect(schema.examples).toEqual([{ user_name: "bob" }]);
    expect(Object.keys(properties)).toEqual(["user_name"]);
    expect(schema.required).toEqual(["user_name"]);
  });

  it("should preserve source order for @@example augment decorators", async () => {
    const { builder } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        a: string;
      }
      @@example(M.a, "aug1");
      @@example(M.a, "aug2");
    `);

    const props = propertiesOf(builder.getSchemas().M);
    expect(schemaOf(props.a).examples).toEqual(["aug1", "aug2"]);
  });

  it("should encode a nested property inside a model-level @example", async () => {
    const { builder } = await buildDocSchema(t.code`
      @example(#{ ts: utcDateTime.fromISO("2020-01-01T00:00:00Z") })
      model ${t.model("M")} {
        @encode("unixTimestamp", int32)
        ts: utcDateTime;
      }
    `);

    const schema = builder.getSchemas().M;
    expect(propertiesOf(schema).ts).toEqual({ type: "integer", format: "unixtime" });
    // The example is one level up from the encoded property, so this proves
    // the encoding is applied while walking into an object value, not only
    // at the top of one.
    expect(schema.examples).toEqual([{ ts: 1577836800 }]);
  });

  it("should encode an @example on a property whose type is a model with an encoded nested property", async () => {
    const { builder } = await buildDocSchema(t.code`
      model Inner {
        @encode("unixTimestamp", int32)
        ts: utcDateTime;
      }
      model ${t.model("M")} {
        @example(#{ ts: utcDateTime.fromISO("2020-01-01T00:00:00Z") })
        p: Inner;
      }
    `);

    const props = propertiesOf(builder.getSchemas().M);
    expect(schemaOf(props.p).examples).toEqual([{ ts: 1577836800 }]);
    const inner = builder.getSchemas().Inner;
    expect(propertiesOf(inner).ts).toEqual({ type: "integer", format: "unixtime" });
  });

  it("should encode a scalar's own @encode in both its schema and its @example", async () => {
    const { builder } = await buildDocSchema(t.code`
      @encode("unixTimestamp", int32)
      scalar MyTs extends utcDateTime;
      model ${t.model("M")} {
        @example(MyTs.fromISO("2020-01-01T00:00:00Z"))
        a: MyTs;
      }
    `);

    const props = propertiesOf(builder.getSchemas().M);
    // The encoding is declared on the scalar, not on the property. It has to
    // reach the use site through the `baseScalar` chain.
    expect(schemaOf(props.a).type).toBe("integer");
    expect(schemaOf(props.a).format).toBe("unixtime");
    expect(schemaOf(props.a).examples).toEqual([1577836800]);
  });

  it("should not let unrelated edits in a different file reorder cross-file @@example augment decorators", async () => {
    const mainCode = t.code`
      model ${t.model("M")} {
        f: string;
      }
      @@example(M, #{ f: "fromMainFile" });
    `;

    const testerA = AsyncAPITester.files({
      "aug.tsp": `@@example(M, #{ f: "fromAugFile" });`,
    }).import("./aug.tsp");
    const resultA = await testerA.compile(mainCode);
    const MA = resultA.M;
    const builderA = new SchemaBuilder(resultA.program);
    builderA.buildSchema(MA);
    const examplesA = builderA.getSchemas().M.examples;

    const testerB = AsyncAPITester.files({
      "aug.tsp": `
        // pad line 1
        // pad line 2
        // pad line 3
        // pad line 4
        // pad line 5
        // pad line 6
        // pad line 7
        // pad line 8
        // pad line 9
        // pad line 10
        @@example(M, #{ f: "fromAugFile" });
      `,
    }).import("./aug.tsp");
    const resultB = await testerB.compile(mainCode);
    const MB = resultB.M;
    const builderB = new SchemaBuilder(resultB.program);
    builderB.buildSchema(MB);
    const examplesB = builderB.getSchemas().M.examples;

    expect(examplesB).toEqual(examplesA);
  });

  it("should keep the JSON-encoded property key/required name even when an XML @encodedName is also declared (pinned; Phase 3 must thread the message's real contentType)", async () => {
    const { builder } = await buildDocSchema(t.code`
      model ${t.model("M")} {
        @encodedName("application/json", "u_json")
        @encodedName("application/xml", "u_xml")
        userName: string;
      }
    `);

    const schema = builder.getSchemas().M;
    const properties = propertiesOf(schema);
    expect(Object.keys(properties)).toEqual(["u_json"]);
    expect(schema.required).toEqual(["u_json"]);
  });

  it("should apply docs to a named enum's registered schema", async () => {
    const { builder } = await buildDocSchema(t.code`
      /** Colors. */
      @summary("Color")
      enum ${t.enum("Color")} { Red, Green }
      model ${t.model("M")} {
        c: Color;
      }
    `);

    expect(builder.getSchemas().Color).toEqual({
      type: "string",
      enum: ["Red", "Green"],
      title: "Color",
      description: "Colors.",
    });
  });

  it("should apply docs to a named union's registered schema", async () => {
    const { builder } = await buildDocSchema(t.code`
      /** Either. */
      union ${t.union("Either")} { string, int32 }
      model ${t.model("M")} {
        e: Either;
      }
    `);

    expect(builder.getSchemas().Either).toEqual({
      anyOf: [{ type: "string" }, { type: "integer", format: "int32" }],
      description: "Either.",
    });
  });

  it("should apply a union variant's own doc comment/@summary to its anyOf branch", async () => {
    const { builder } = await buildDocSchema(t.code`
      union ${t.union("Either")} {
        /** The numeric branch. */
        @summary("Num")
        num: int32,
        str: string,
      }
      model ${t.model("M")} {
        e: Either;
      }
    `);

    expect(builder.getSchemas().Either).toEqual({
      anyOf: [
        {
          type: "integer",
          format: "int32",
          title: "Num",
          description: "The numeric branch.",
        },
        { type: "string" },
      ],
    });
  });

  it("should apply docs to a named array-alias model's registered schema", async () => {
    const { builder } = await buildDocSchema(t.code`
      /** A list of names. */
      model ${t.model("Names")} is string[];
      model ${t.model("M")} {
        n: Names;
      }
    `);

    expect(builder.getSchemas().Names).toEqual({
      type: "array",
      items: { type: "string" },
      description: "A list of names.",
    });
  });

  it("should not throw and should skip a malformed duration @example (compiler's Temporal.Duration.from throws a plain RangeError), reporting a diagnostic instead of dropping it silently", async () => {
    const { builder, program, M } = await compileSchemas(t.code`
      model ${t.model("M")} {
        @example(duration.fromISO("not-a-duration"))
        d: duration;
      }
    `);
    expect(() => builder.buildSchema(M)).not.toThrow();

    const props = propertiesOf(builder.getSchemas().M);
    expect(Object.hasOwn(props.d as object, "examples")).toBe(false);
    expect(program.diagnostics).toHaveLength(1);
    expect(program.diagnostics[0].code).toBe("tsp-asyncapi/unserializable-example");
    expect(program.diagnostics[0].severity).toBe("warning");
  });

  it("should keep the registry usable after a build() failure instead of leaving a dangling $ref (registerNamed try/finally)", async () => {
    const { builder, M } = await compileSchemas(t.code`
      model ${t.model("M")} {
        f: string;
      }
    `);
    const spy = vi
      .spyOn(
        builder as unknown as { buildObjectSchema: (m: unknown) => unknown },
        "buildObjectSchema",
      )
      .mockImplementationOnce(() => {
        throw new Error("boom");
      });

    expect(() => builder.buildSchema(M)).toThrow("boom");
    spy.mockRestore();

    // A retry must not return a $ref to a key that never got registered.
    const ref = builder.buildSchema(M) as { $ref: string };
    expect(ref.$ref).toBe("#/components/schemas/M");
    expect(Object.hasOwn(builder.getSchemas(), "M")).toBe(true);
  });

  it("should carry a base scalar's @doc/@summary through more than one level of derivation", async () => {
    const { builder } = await buildDocSchema(t.code`
      /** An email address. */
      @summary("Email")
      scalar Email extends string;
      scalar WorkEmail extends Email;
      model ${t.model("M")} {
        e: WorkEmail;
      }
    `);

    const props = propertiesOf(builder.getSchemas().M);
    expect(props.e).toEqual({
      type: "string",
      title: "Email",
      description: "An email address.",
    });
  });

  it("keeps a generic model's own @doc/@summary on every instantiation", async () => {
    // `Envelope`'s own doc/summary are declared once, on the
    // uninstantiated template. TypeSpec's instantiation semantics copy
    // the type definition, so each instantiation must carry them too,
    // not just the first one built.
    const { builder, W } = await compileSchemas(t.code`
      /** A generic envelope. */
      @summary("Envelope")
      model Envelope<T> {
        data: T;
      }
      model Order { id: string; }
      model Product { sku: string; }
      @test("W")
      model W {
        order: Envelope<Order>;
        product: Envelope<Product>;
      }
    `);
    builder.buildSchema(W as Model);
    const components = builder.getSchemas();

    expect(components.EnvelopeOrder).toMatchObject({
      title: "Envelope",
      description: "A generic envelope.",
    });
    expect(components.EnvelopeProduct).toMatchObject({
      title: "Envelope",
      description: "A generic envelope.",
    });
  });
});
