import { describe, it, expect } from "vitest";
import { AsyncAPITester } from "../../../src/testing/index.js";
import { Model } from "@typespec/compiler";
import { compileSchemas } from "../../utils/schema-host.js";
import { t } from "@typespec/compiler/testing";
import { SchemaBuilder } from "../../../src/lower/schemas.js";
import { byCodePoint } from "../../utils/sort.js";
import { diagnosticsWith } from "../../utils/diagnostics.js";
import { propertiesOf, refOf, schemaOf } from "../../utils/document.js";
import type { ReferenceObject, SchemaObject } from "../../../src/types/index.js";

/**
 * The `x` property of the `data` property of one built schema.
 *
 * Two levels of "this is a schema, not a reference, and it describes
 * properties". Spelled out at both call sites it buries what is being
 * compared.
 */
const dataX = (value: SchemaObject | ReferenceObject) =>
  propertiesOf(schemaOf(propertiesOf(schemaOf(value)).data)).x;

describe("Unit: Schemas — inlining and promotion of instantiations", () => {
  it('inlines a template instantiation with a string-literal template argument (P<"created">) instead of registering a synthesized name', async () => {
    // A literal has no fixed identity of its own to name the
    // instantiation after. It is unspeakable, matching the official
    // `TypeEmitter.declarationName`'s own behavior: the whole
    // instantiation inlines instead of registering under a synthesized
    // `components.schemas` key.
    const runner = await AsyncAPITester.createInstance();
    const { W } = await runner.compile(t.code`
      model P<T> { v: T; }
      @test("W")
      model W { a: P<"created">; b: P<"deleted">; }
    `);
    const builder = new SchemaBuilder(runner.program);
    builder.buildSchema(W as Model);
    const components = builder.getSchemas();
    const props = propertiesOf(components.W);

    expect(props.a).toEqual({
      type: "object",
      properties: { v: { type: "string", enum: ["created"] } },
      required: ["v"],
    });
    expect(props.b).toEqual({
      type: "object",
      properties: { v: { type: "string", enum: ["deleted"] } },
      required: ["v"],
    });
    expect(Object.hasOwn(components, "PCreated")).toBe(false);
    expect(Object.hasOwn(components, "PDeleted")).toBe(false);

    // Swapping the field declaration order must not change the inlined
    // shape; there is no shared key left to race over.
    const { W2 } = await runner.compile(t.code`
      model P<T> { v: T; }
      @test("W2")
      model W2 { b: P<"deleted">; a: P<"created">; }
    `);
    const builder2 = new SchemaBuilder(runner.program);
    builder2.buildSchema(W2 as Model);
    const components2 = builder2.getSchemas();
    const props2 = propertiesOf(components2.W2);
    expect(props2.a).toEqual(props.a);
    expect(props2.b).toEqual(props.b);
  });

  it("promotes an unspeakable instantiation to a registered component once a second site references it", async () => {
    // Inlining is preferred for a single use. But inlining copies the
    // whole shape into every site that uses it, so nested unspeakable
    // declarations duplicate multiplicatively: a chain where each level
    // references the level below twice grows as 2^depth. Promoting on the
    // second use keeps that growth linear.
    // Promotion rewrites the copy the first site already holds, so every
    // site ends up referring to the one component. Leaving that first copy
    // expanded would emit the body twice, and which site kept the expansion
    // would depend on the order the sources were declared in.
    const { builder, program, M } = await compileSchemas(t.code`
      model Env<T> { v: T; }
      alias Shared = Env<{ x: string }>;
      @test("M")
      model M { a: Shared; b: Shared; c: Shared; }
    `);
    builder.buildSchema(M as Model);
    const components = builder.getSchemas();
    const props = propertiesOf(components.M);

    const inlineShape = {
      type: "object",
      properties: {
        v: { type: "object", properties: { x: { type: "string" } }, required: ["x"] },
      },
      required: ["v"],
    };
    // Every site refers to the one registered component, the first
    // included.
    expect(props.a).toEqual(props.b);
    expect(props.b).toEqual(props.c);
    const key = refOf(props.b).replace("#/components/schemas/", "");
    expect(components[key]).toEqual(inlineShape);
    // The body is emitted once, as that component.
    expect(JSON.stringify(components.M)).not.toContain('"properties":{"x"');
    // The body is registered as already built, so a single mistake inside
    // it is never reported twice.
    expect(program.diagnostics).toHaveLength(0);
  });

  it("inlines a template instantiation with a numeric/boolean literal template argument instead of registering a synthesized name", async () => {
    const { builder, W } = await compileSchemas(t.code`
      model P<T> { v: T; }
      @test("W")
      model W { c: P<42>; d: P<true>; }
    `);
    builder.buildSchema(W as Model);
    const components = builder.getSchemas();
    const props = propertiesOf(components.W);

    expect(props.c).toEqual({
      type: "object",
      properties: { v: { type: "number", enum: [42] } },
      required: ["v"],
    });
    expect(props.d).toEqual({
      type: "object",
      properties: { v: { type: "boolean", enum: [true] } },
      required: ["v"],
    });
    expect(Object.hasOwn(components, "P42")).toBe(false);
    expect(Object.hasOwn(components, "PTrue")).toBe(false);
  });

  it("inlines distinct string-literal template arguments to their own literal shape instead of composing a synthesized name", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { M } = await runner.compile(t.code`
      model P<T> { v: T; }
      @test("M")
      model M { a: P<"user-created">; b: P<"user_created">; }
    `);
    const builder = new SchemaBuilder(runner.program);
    builder.buildSchema(M as Model);
    const components = builder.getSchemas();
    const props = propertiesOf(components.M);

    expect(props.a).toEqual({
      type: "object",
      properties: { v: { type: "string", enum: ["user-created"] } },
      required: ["v"],
    });
    expect(props.b).toEqual({
      type: "object",
      properties: { v: { type: "string", enum: ["user_created"] } },
      required: ["v"],
    });
    expect(props.a).not.toEqual(props.b);
    expect(Object.keys(components)).toEqual(["M"]);

    // Degenerate case: an empty literal and a lone separator still inline
    // to their own distinct literal shape.
    const { M2 } = await runner.compile(t.code`
      model P<T> { v: T; }
      @test("M2")
      model M2 { a: P<"">; b: P<"-">; }
    `);
    const builder2 = new SchemaBuilder(runner.program);
    builder2.buildSchema(M2 as Model);
    const components2 = builder2.getSchemas();
    const props2 = propertiesOf(components2.M2);
    expect(props2.a).toEqual({
      type: "object",
      properties: { v: { type: "string", enum: [""] } },
      required: ["v"],
    });
    expect(props2.b).toEqual({
      type: "object",
      properties: { v: { type: "string", enum: ["-"] } },
      required: ["v"],
    });
  });

  it("inlines a string-literal template argument with unsafe separator characters instead of needing an escaped $ref", async () => {
    // A literal argument is unspeakable regardless of which characters it
    // carries, so `#`, `/`, and a space here never need to reach a
    // `components.schemas` key or an escaped $ref at all: the whole
    // instantiation inlines with the literal's own raw text in `enum`.
    const { builder, M } = await compileSchemas(t.code`
      model P<T> { v: T; }
      @test("M")
      model M { a: P<"user#created">; b: P<"a/b">; c: P<"has space">; }
    `);
    builder.buildSchema(M as Model);
    const components = builder.getSchemas();
    const props = propertiesOf(components.M);

    expect(props.a).toEqual({
      type: "object",
      properties: { v: { type: "string", enum: ["user#created"] } },
      required: ["v"],
    });
    expect(props.b).toEqual({
      type: "object",
      properties: { v: { type: "string", enum: ["a/b"] } },
      required: ["v"],
    });
    expect(props.c).toEqual({
      type: "object",
      properties: { v: { type: "string", enum: ["has space"] } },
      required: ["v"],
    });
    expect(Object.keys(components)).toEqual(["M"]);
  });

  it("inlines a numeric-literal template argument to its own literal shape instead of composing a synthesized name", async () => {
    const { builder, M } = await compileSchemas(t.code`
      model P<T> { v: T; }
      @test("M")
      model M { a: P<1>; b: P<-1>; c: P<1.5>; }
    `);
    builder.buildSchema(M as Model);
    const components = builder.getSchemas();
    const props = propertiesOf(components.M);

    expect(props.a).toEqual({
      type: "object",
      properties: { v: { type: "number", enum: [1] } },
      required: ["v"],
    });
    expect(props.b).toEqual({
      type: "object",
      properties: { v: { type: "number", enum: [-1] } },
      required: ["v"],
    });
    expect(props.c).toEqual({
      type: "object",
      properties: { v: { type: "number", enum: [1.5] } },
      required: ["v"],
    });
    expect(Object.keys(components)).toEqual(["M"]);
  });

  it("distinguishes a tuple template argument from the unknown intrinsic: unknown stays a named instantiation, a tuple argument inlines", async () => {
    // `unknown` is an `Intrinsic` with a fixed name; it stays speakable.
    // A `Tuple`, like `[string, int32]`, has no fixed identity of its own
    // (matching the official `TypeEmitter.declarationName`'s own handling
    // of a `Tuple` argument), so the whole instantiation inlines instead.
    const { builder, program, M } = await compileSchemas(t.code`
      model P<T> { v: T; }
      @test("M")
      model M { a: P<unknown>; b: P<[string, int32]>; }
    `);
    builder.buildSchema(M as Model);
    const components = builder.getSchemas();
    const props = propertiesOf(components.M);

    expect(props.a.$ref).toBe("#/components/schemas/PUnknown");
    expect(props.b.$ref).toBeUndefined();
    expect(schemaOf(props.b).type).toBe("object");
    // The compiler substitutes the bare Tuple type directly for `T`.
    // `buildSchema` has no representation for a bare Tuple value; it
    // degrades to `{}` and reports the pre-existing
    // `unsupported-payload-type` diagnostic, the same as any other
    // unsupported payload type.
    expect(propertiesOf(schemaOf(props.b)).v).toEqual({});
    expect(diagnosticsWith(program.diagnostics, "unsupported-payload-type")).toHaveLength(1);
  });

  it("distinguishes a tuple template argument from its bare element type: the bare type stays a named instantiation, the tuple argument inlines", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { M } = await runner.compile(t.code`
      model P<T> { v: T; }
      @test("M")
      model M { a: P<string>; b: P<[string]>; }
    `);
    const builder = new SchemaBuilder(runner.program);
    builder.buildSchema(M as Model);
    const components = builder.getSchemas();
    const props = propertiesOf(components.M);

    expect(props.a.$ref).toBe("#/components/schemas/PString");
    expect(props.b.$ref).toBeUndefined();
    expect(schemaOf(props.b).type).toBe("object");
    expect(propertiesOf(schemaOf(props.b)).v).toEqual({});

    const runnerReversed = await AsyncAPITester.createInstance();
    const { M: M2 } = await runnerReversed.compile(t.code`
      model P<T> { v: T; }
      @test("M")
      model M { b: P<[string]>; a: P<string>; }
    `);
    const builder2 = new SchemaBuilder(runnerReversed.program);
    builder2.buildSchema(M2 as Model);
    const props2 = propertiesOf(builder2.getSchemas().M);

    expect(props2.a.$ref).toBe("#/components/schemas/PString");
    expect(props2.b).toEqual(props.b);
  });

  it("inlines a template instantiation with an anonymous model/union template argument instead of registering a synthesized name, stably regardless of field order", async () => {
    // An anonymous `Model`/`Union` has no fixed identity of its own to name
    // the instantiation after. It is unspeakable, so the whole
    // instantiation inlines with the argument's own shape substituted in.
    const runner = await AsyncAPITester.createInstance();
    const { M } = await runner.compile(t.code`
      model Envelope<T> { data: T; }
      @test("M")
      model M { a: Envelope<{x: string}>; b: Envelope<{y: int32}>; c: Envelope<string | int32>; d: Envelope<boolean | null>; }
    `);
    const builder = new SchemaBuilder(runner.program);
    builder.buildSchema(M as Model);
    const components = builder.getSchemas();
    const props = propertiesOf(components.M);

    expect(props.a).toEqual({
      type: "object",
      properties: {
        data: { type: "object", properties: { x: { type: "string" } }, required: ["x"] },
      },
      required: ["data"],
    });
    expect(props.b).toEqual({
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: { y: { type: "integer", format: "int32" } },
          required: ["y"],
        },
      },
      required: ["data"],
    });
    expect(props.c).toEqual({
      type: "object",
      properties: {
        data: { anyOf: [{ type: "string" }, { type: "integer", format: "int32" }] },
      },
      required: ["data"],
    });
    expect(props.d).toEqual({
      type: "object",
      properties: { data: { anyOf: [{ type: "boolean" }, { type: "null" }] } },
      required: ["data"],
    });
    expect(Object.keys(components)).toEqual(["M"]);

    // Order stability: swapping field order must not change the inlined
    // shape; nothing here depends on visitation order any more.
    const runnerReversed = await AsyncAPITester.createInstance();
    const { M: M2 } = await runnerReversed.compile(t.code`
      model Envelope<T> { data: T; }
      @test("M")
      model M { b: Envelope<{y: int32}>; a: Envelope<{x: string}>; d: Envelope<boolean | null>; c: Envelope<string | int32>; }
    `);
    const builder2 = new SchemaBuilder(runnerReversed.program);
    builder2.buildSchema(M2 as Model);
    const props2 = propertiesOf(builder2.getSchemas().M);

    expect(props2.a).toEqual(props.a);
    expect(props2.b).toEqual(props.b);
    expect(props2.c).toEqual(props.c);
    expect(props2.d).toEqual(props.d);
  });

  it("inlines two structurally-identical anonymous-model template arguments independently instead of needing a collision diagnostic", async () => {
    // Two separate anonymous-model type arguments with the same shape
    // (`{x: string}`) are distinct `Type` objects, but each is unspeakable
    // on its own terms (see `templateArgDisplayName`). Each instantiation
    // now inlines independently. There is no shared synthesized key left
    // for the two to collide over, so no diagnostic is reported even
    // though the two inlined shapes are structurally identical.
    const { builder, program, M } = await compileSchemas(t.code`
      model Envelope<T> { data: T; }
      @test("M")
      model M { a: Envelope<{x: string}>; b: Envelope<{x: string}>; }
    `);
    builder.buildSchema(M as Model);
    const props = propertiesOf(builder.getSchemas().M);

    const expected = {
      type: "object",
      properties: {
        data: { type: "object", properties: { x: { type: "string" } }, required: ["x"] },
      },
      required: ["data"],
    };
    expect(props.a).toEqual(expected);
    expect(props.b).toEqual(expected);
    expect(Object.keys(builder.getSchemas())).toEqual(["M"]);

    expect(diagnosticsWith(program.diagnostics, "duplicate-schema-key")).toHaveLength(0);
  });

  it("inlines a string-literal template argument's distinct separator characters to their own literal shape instead of composing a synthesized name", async () => {
    const { builder, M } = await compileSchemas(t.code`
      model P<T> { v: T; }
      @test("M")
      model M { a: P<"a b">; b: P<"a#b">; }
    `);
    builder.buildSchema(M as Model);
    const props = propertiesOf(builder.getSchemas().M);

    expect(props.a).toEqual({
      type: "object",
      properties: { v: { type: "string", enum: ["a b"] } },
      required: ["v"],
    });
    expect(props.b).toEqual({
      type: "object",
      properties: { v: { type: "string", enum: ["a#b"] } },
      required: ["v"],
    });
    expect(props.a).not.toEqual(props.b);
  });

  it("inlines a numeric template argument in exponent form to its own literal shape instead of needing a safe schema key", async () => {
    const { builder, M } = await compileSchemas(t.code`
      model P<T> { v: T; }
      @test("M")
      model M { a: P<100000000000000000000000>; b: P<1e21>; }
    `);
    builder.buildSchema(M as Model);
    const components = builder.getSchemas();
    const props = propertiesOf(components.M);

    expect(props.a).toEqual({
      type: "object",
      properties: { v: { type: "number", enum: [1e23] } },
      required: ["v"],
    });
    expect(props.b).toEqual({
      type: "object",
      properties: { v: { type: "number", enum: [1e21] } },
      required: ["v"],
    });
    expect(props.a).not.toEqual(props.b);
    expect(Object.keys(components)).toEqual(["M"]);
  });

  it("inlines anonymous-model template arguments independently, keeping distinct property types, stably regardless of field order", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { M } = await runner.compile(t.code`
      model Envelope<T> { data: T; }
      @test("M")
      model M { a: Envelope<{x: string}>; b: Envelope<{x: int32}>; }
    `);
    const builder = new SchemaBuilder(runner.program);
    builder.buildSchema(M as Model);
    const props = propertiesOf(builder.getSchemas().M);

    expect(props.a).not.toEqual(props.b);
    expect(dataX(props.a)).toEqual({ type: "string" });
    expect(dataX(props.b)).toEqual({
      type: "integer",
      format: "int32",
    });

    const runnerReversed = await AsyncAPITester.createInstance();
    const { M: M2 } = await runnerReversed.compile(t.code`
      model Envelope<T> { data: T; }
      @test("M")
      model M { b: Envelope<{x: int32}>; a: Envelope<{x: string}>; }
    `);
    const builder2 = new SchemaBuilder(runnerReversed.program);
    builder2.buildSchema(M2 as Model);
    const props2 = propertiesOf(builder2.getSchemas().M);

    expect(props2.a).toEqual(props.a);
    expect(props2.b).toEqual(props.b);
  });

  it("inlines a literal that spells the Sep escape marker distinct from a literal using the real separator it once encoded, stably regardless of field order", async () => {
    // Sep-encoding no longer applies here: a literal template argument is
    // unspeakable and inlines with its own raw text in `enum`. `"a b"` and
    // `"ASep32B"` are just two different literal values now, distinct
    // because their raw text differs, not because of any escape scheme.
    const runner = await AsyncAPITester.createInstance();
    const { M } = await runner.compile(t.code`
      model P<T> { v: T; }
      @test("M")
      model M { a: P<"a b">; b: P<"ASep32B">; }
    `);
    const builder = new SchemaBuilder(runner.program);
    builder.buildSchema(M as Model);
    const props = propertiesOf(builder.getSchemas().M);

    expect(props.a).toEqual({
      type: "object",
      properties: { v: { type: "string", enum: ["a b"] } },
      required: ["v"],
    });
    expect(props.b).toEqual({
      type: "object",
      properties: { v: { type: "string", enum: ["ASep32B"] } },
      required: ["v"],
    });
    expect(props.a).not.toEqual(props.b);

    const runnerReversed = await AsyncAPITester.createInstance();
    const { M: M2 } = await runnerReversed.compile(t.code`
      model P<T> { v: T; }
      @test("M")
      model M { b: P<"ASep32B">; a: P<"a b">; }
    `);
    const builder2 = new SchemaBuilder(runnerReversed.program);
    builder2.buildSchema(M2 as Model);
    const props2 = propertiesOf(builder2.getSchemas().M);

    expect(props2.a).toEqual(props.a);
    expect(props2.b).toEqual(props.b);
  });

  it("inlines a string-template template argument whether or not the compiler reduced it, matching the plain string-literal argument next to it", async () => {
    // A string template is a literal value, so it has no fixed identity to
    // name an instantiation after. It inlines, exactly like the plain
    // string literal `a` uses. A reduced template and a plain literal of
    // the same text must not disagree: one cannot inline while the other
    // registers a synthesized `components.schemas` key.
    const { builder, M } = await compileSchemas(t.code`
      model P<T> { v: T; }
      @test("M")
      model M { a: P<"abc">; b: P<"a\${"b"}c">; c: P<"x-\${"y"}">; }
    `);
    builder.buildSchema(M as Model);
    const components = builder.getSchemas();
    const props = propertiesOf(components.M);

    // Only `M` itself is registered. No `PAbc` or similar key exists.
    expect(Object.keys(components)).toEqual(["M"]);

    expect(props.a).toEqual({
      type: "object",
      properties: { v: { type: "string", enum: ["abc"] } },
      required: ["v"],
    });
    // A string template carries no schema mapping of its own yet, so the
    // inlined property degrades to the unconstrained schema. The key point
    // here is that it inlines rather than claiming a named component.
    expect(props.b).toEqual({
      type: "object",
      properties: { v: {} },
      required: ["v"],
    });
    expect(props.c).toEqual(props.b);
  });

  it("inlines a whole nested instantiation chain when only the innermost template argument is unspeakable", async () => {
    // `Inner<{x: string}>` is unspeakable, so `Outer<Inner<{x: string}>>`
    // is too: unspeakability propagates outward through every level. The
    // speakable `Outer<Inner<string>>` next to it still registers both of
    // its levels, so the propagation is not over-eager.
    const { builder, M } = await compileSchemas(t.code`
      model Inner<T> { i: T; }
      model Outer<T> { o: T; }
      @test("M")
      model M { a: Outer<Inner<{x: string}>>; b: Outer<Inner<string>>; }
    `);
    builder.buildSchema(M as Model);
    const components = builder.getSchemas();
    const props = propertiesOf(components.M);

    expect(Object.keys(components).sort(byCodePoint)).toEqual([
      "InnerString",
      "M",
      "OuterInnerString",
    ]);
    expect(props.a).toEqual({
      type: "object",
      properties: {
        o: {
          type: "object",
          properties: {
            i: { type: "object", properties: { x: { type: "string" } }, required: ["x"] },
          },
          required: ["i"],
        },
      },
      required: ["o"],
    });
    expect(props.b).toEqual({ $ref: "#/components/schemas/OuterInnerString" });
  });

  it("inlines instantiations taking a const value argument instead of making two distinct consts claim one key", async () => {
    // A value has no nameable identity of its own. Naming both
    // instantiations after a fixed placeholder would turn valid TypeSpec
    // into a `duplicate-schema-key` error.
    const { builder, M } = await compileSchemas(t.code`
      model P<T extends valueof string> { v: string; }
      const c1: string = "one";
      const c2: string = "two";
      @test("M")
      model M { a: P<c1>; b: P<c2>; }
    `);
    builder.buildSchema(M as Model);
    const components = builder.getSchemas();
    const props = propertiesOf(components.M);

    expect(Object.keys(components)).toEqual(["M"]);
    const inlined = {
      type: "object",
      properties: { v: { type: "string" } },
      required: ["v"],
    };
    expect(props.a).toEqual(inlined);
    expect(props.b).toEqual(inlined);
  });

  it("registers a self-recursive instantiation with an anonymous-model argument instead of inlining it into a circular-reference error", async () => {
    // `Node<{x: string}>` has no composable structural name, so the
    // default is to inline it. A self-recursive instantiation cannot be
    // expressed inline: expanding it always leaves another self-reference
    // behind. So it is promoted to a real `components.schemas` entry under
    // the `getTypeName`-derived fallback name, and `children.items`
    // resolves to a genuine self-`$ref`.
    const { builder, program, M } = await compileSchemas(t.code`
      model Node<T> { v: T; children: Node<T>[]; }
      @test("M")
      model M { a: Node<{x: string}>; b: Node<string>; }
    `);
    builder.buildSchema(M as Model);
    const components = builder.getSchemas();
    const props = propertiesOf(components.M);

    // The speakable neighbour keeps its compact composed name.
    expect(props.b.$ref).toBe("#/components/schemas/NodeString");

    // The fallback key is the compact shape with each template argument
    // replaced by the Sep-encoded official `getEntityName` text of that
    // argument, here `{ x: string }`.
    const key = "NodeSep123Sep32XSep58Sep32StringSep32Sep125";
    const selfRef = `#/components/schemas/${key}`;
    expect(props.a.$ref).toBe(selfRef);
    const promoted = components[key];
    expect(promoted).toBeDefined();
    expect(propertiesOf(promoted).v).toEqual({
      type: "object",
      properties: { x: { type: "string" } },
      required: ["x"],
    });
    expect(propertiesOf(promoted).children).toEqual({
      type: "array",
      items: { $ref: selfRef },
    });

    expect(diagnosticsWith(program.diagnostics, "unrepresentable-circular-reference")).toEqual([]);
  });

  it("reports a duplicate-schema-key error when two self-recursive instantiations with structurally identical anonymous-model arguments resolve to one fallback key", async () => {
    // Two separately written `{x: string}` arguments are two distinct
    // anonymous models, so `a` and `b` are two distinct instantiations.
    // The fallback name is built from each argument's official
    // `getEntityName` text, which is identical for both. So they land on
    // one key. That is a hard error, the same collision policy every other
    // candidate-name clash gets, rather than a silent rename.
    const { builder, program, M } = await compileSchemas(t.code`
      model Node<T> { v: T; children: Node<T>[]; }
      @test("M")
      model M { a: Node<{x: string}>; b: Node<{x: string}>; }
    `);
    builder.buildSchema(M as Model);
    const components = builder.getSchemas();
    const props = propertiesOf(components.M);

    const key = "NodeSep123Sep32XSep58Sep32StringSep32Sep125";
    expect(props.a.$ref).toBe(`#/components/schemas/${key}`);
    expect(props.b.$ref).toBe(`#/components/schemas/${key}`);
    expect(components[key]).toBeDefined();

    const duplicates = diagnosticsWith(program.diagnostics, "duplicate-schema-key");
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].severity).toBe("error");
  });

  it("reports a diagnostic once, not twice, when a self-recursive instantiation is promoted after an inline attempt", async () => {
    // `Node<{x: string}>` is first attempted inline, then promoted to a
    // registered component once it re-enters itself. The shape built by
    // that attempt is registered as-is, so the body is built exactly once
    // and the unsupported `Iface` property is reported once. The speakable
    // neighbour `Node<string>` never inlines and gives the baseline count.
    const { builder, program, M } = await compileSchemas(t.code`
      interface Iface { doThing(): void; }
      model Node<T> { v: T; bad: Iface; children: Node<T>[]; }
      @test("M")
      model M { a: Node<{x: string}>; }
    `);
    builder.buildSchema(M as Model);

    expect(diagnosticsWith(program.diagnostics, "unsupported-payload-type")).toHaveLength(1);
  });

  it("reports a diagnostic once when two properties reference the same promoted self-recursive instantiation", async () => {
    // The `alias` makes both properties resolve to one `Node<{x: string}>`
    // Type instance. The first reference promotes it to a component. The
    // second must reuse that cached declaration instead of rebuilding the
    // body and re-reporting every diagnostic of the first attempt.
    const { builder, program, M } = await compileSchemas(t.code`
      interface Iface { doThing(): void; }
      model Node<T> { v: T; bad: Iface; children: Node<T>[]; }
      alias N = Node<{x: string}>;
      @test("M")
      model M { a: N; b: N; }
    `);
    builder.buildSchema(M as Model);

    expect(diagnosticsWith(program.diagnostics, "unsupported-payload-type")).toHaveLength(1);

    // Both properties resolve to the one registered component.
    const components = builder.getSchemas();
    const props = propertiesOf(components.M);
    expect(props.a.$ref).toBe(props.b.$ref);
    const key = String(props.a.$ref).replace("#/components/schemas/", "");
    expect(Object.hasOwn(components, key)).toBe(true);
  });

  it("reports a missing-discriminator-property diagnostic once for a promoted self-recursive instantiation", async () => {
    const { builder, program, M } = await compileSchemas(t.code`
      @discriminator("kind")
      model Node<T> { v: T; children: Node<T>[]; }
      @test("M")
      model M { a: Node<{x: string}>; }
    `);
    builder.buildSchema(M as Model);

    expect(diagnosticsWith(program.diagnostics, "missing-discriminator-property")).toHaveLength(1);
  });

  it("inlines instantiations taking an operation type argument instead of making two distinct operations claim one key", async () => {
    // An `Operation` argument is not one of the handled, nameable kinds.
    // It has no fixed identity to compose a key from, so the instantiation
    // is unspeakable and inlines, exactly like a value or a literal
    // argument. Naming both instantiations after one fixed placeholder
    // would turn valid TypeSpec into a `duplicate-schema-key` error.
    const { builder, program, M } = await compileSchemas(t.code`
      op opA(): void;
      op opB(): void;
      model P<T extends TypeSpec.Reflection.Operation> { v: string; }
      @test("M")
      model M { a: P<opA>; b: P<opB>; }
    `);
    builder.buildSchema(M as Model);
    const components = builder.getSchemas();
    const props = propertiesOf(components.M);

    expect(Object.keys(components)).toEqual(["M"]);
    const inlined = {
      type: "object",
      properties: { v: { type: "string" } },
      required: ["v"],
    };
    expect(props.a).toEqual(inlined);
    expect(props.b).toEqual(inlined);
    expect(diagnosticsWith(program.diagnostics, "duplicate-schema-key")).toEqual([]);
  });

  it("keeps two self-recursive union instantiations with anonymous-model arguments under separate keys", async () => {
    // The official `getTypeName` drops a union's template arguments, so
    // the fallback name is composed per argument instead. Two recursive
    // instantiations of one template union therefore stay apart rather
    // than colliding on the bare template name.
    const { builder, program, M } = await compileSchemas(t.code`
      union Chain<T> { head: T, next: Chain<T> }
      @test("M")
      model M { a: Chain<{x: string}>; b: Chain<{y: int32}>; }
    `);
    builder.buildSchema(M as Model);
    const components = builder.getSchemas();
    const props = propertiesOf(components.M);

    const keyA = "ChainSep123Sep32XSep58Sep32StringSep32Sep125";
    const keyB = "ChainSep123Sep32YSep58Sep32Int32Sep32Sep125";
    expect(props.a.$ref).toBe(`#/components/schemas/${keyA}`);
    expect(props.b.$ref).toBe(`#/components/schemas/${keyB}`);
    expect(components[keyA].anyOf).toEqual([
      { type: "object", properties: { x: { type: "string" } }, required: ["x"] },
      { $ref: `#/components/schemas/${keyA}` },
    ]);
    expect(components[keyB].anyOf).toEqual([
      {
        type: "object",
        properties: { y: { type: "integer", format: "int32" } },
        required: ["y"],
      },
      { $ref: `#/components/schemas/${keyB}` },
    ]);

    expect(
      program.diagnostics.filter(
        (d) =>
          d.code === "tsp-asyncapi/unrepresentable-circular-reference" ||
          d.code === "tsp-asyncapi/duplicate-schema-key",
      ),
    ).toEqual([]);
  });
});
