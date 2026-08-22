/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect } from "vitest";
import { Model } from "@typespec/compiler";
import { compileSchemas } from "../../utils/schema-host.js";
import { SchemaKeyRegistry } from "../../../src/lower/schemas/key-registration.js";
import { t } from "@typespec/compiler/testing";
import { diagnosticsWith, findDiagnostic } from "../../utils/diagnostics.js";

describe("Unit: Schemas — schema keys and registration", () => {
  it("should Sep-encode `/` and `~` out of a backtick-declared model's own name, rather than leaking them into the schema key", async () => {
    // A model's own name is now sanitized before it becomes a
    // `components.schemas` key (see `sanitizeDeclarationName`). So `/`
    // and `~`, both outside the AsyncAPI Components Object key charset,
    // never reach the key at all. There is nothing left here for
    // `toJsonPointerToken`'s RFC 6901 escaping to do; it stays in place
    // as a defense-in-depth guard for a key from any other future
    // source.
    const { builder, M } = await compileSchemas(t.code`
      model \`x/y\` { z: string; }
      model \`a~b\` { z: string; }
      model ${t.model("M")} {
        q: \`x/y\`;
        r: \`a~b\`;
      }
    `);
    builder.buildSchema(M);

    const components = builder.getSchemas() as Record<string, any>;
    expect(Object.hasOwn(components, "x/y")).toBe(false);
    expect(Object.hasOwn(components, "a~b")).toBe(false);

    const props = components.M.properties as Record<string, any>;
    for (const ref of [props.q.$ref, props.r.$ref] as string[]) {
      const key = ref.replace("#/components/schemas/", "");
      expect(key).toMatch(/^[a-zA-Z0-9.\-_]+$/);
      expect(Object.hasOwn(components, key)).toBe(true);
    }
    // '/' (47) and '~' (126) are each Sep-encoded distinctly.
    expect(props.q.$ref).toBe("#/components/schemas/XSep47Y");
    expect(props.r.$ref).toBe("#/components/schemas/ASep126B");
  });

  it("Sep-encodes a `/`-containing namespace's name into the key, instead of colliding with a same-named global model", async () => {
    // A plain (non-template) declaration's key is namespace-qualified by
    // default (see `declarationNameFor`). `NsFoo` and `GlobalFoo` no
    // longer compute the same bare "Foo" candidate, so they no longer
    // collide. Each namespace segment goes through the same sanitizer a
    // declaration's own name does, so a backtick-quoted namespace such as
    // `` `a/b` `` cannot leak a charset-illegal character into the key.
    // The emitted $ref then needs no JSON-Pointer escaping either.
    const { builder, program, NsFoo, GlobalFoo } = await compileSchemas(t.code`
      namespace \`a/b\` {
        @test("NsFoo")
        model Foo { x: string; }
      }
      @test("GlobalFoo")
      model Foo { z: string; }
    `);
    const ref1 = builder.buildSchema(GlobalFoo as Model) as any;
    const ref2 = builder.buildSchema(NsFoo as Model) as any;

    expect(ref1.$ref).toBe("#/components/schemas/Foo");
    expect(ref2.$ref).toBe("#/components/schemas/ASep47B.Foo");
    expect(Object.hasOwn(builder.getSchemas(), "ASep47B.Foo")).toBe(true);
    expect(Object.hasOwn(builder.getSchemas(), "a/b.Foo")).toBe(false);

    expect(diagnosticsWith(program.diagnostics, "duplicate-schema-key")).toHaveLength(0);
  });

  it("Sep-encodes a `#`-containing or space-containing namespace's name, keeping the key in the AsyncAPI charset and the $ref resolvable", async () => {
    // A raw `#` in a key would put a second `#` in the $ref URI, which is
    // not a resolvable fragment, and a raw space is not a legal key
    // character either. Neither survives sanitization.
    const { builder, M } = await compileSchemas(t.code`
      namespace \`a#b\` { model F { x: string; } }
      namespace \`has space\` { model G { y: string; } }
      @test("M")
      model M {
        f: \`a#b\`.F;
        g: \`has space\`.G;
      }
    `);
    builder.buildSchema(M as Model);

    const components = builder.getSchemas() as Record<string, any>;
    const props = components.M.properties as Record<string, any>;
    for (const ref of [props.f.$ref, props.g.$ref] as string[]) {
      expect(ref.split("#")).toHaveLength(2);
      expect(ref).not.toContain(" ");
      const key = ref.replace("#/components/schemas/", "");
      expect(key).toMatch(/^[a-zA-Z0-9.\-_]+$/);
      expect(Object.hasOwn(components, key)).toBe(true);
    }
    // '#' (35) and ' ' (32) are each Sep-encoded distinctly.
    expect(props.f.$ref).toBe("#/components/schemas/ASep35B.F");
    expect(props.g.$ref).toBe("#/components/schemas/HasSep32Space.G");
  });

  it("gives same-named models in different namespaces distinct, namespace-qualified keys instead of colliding", async () => {
    // `declarationNameFor` now prefixes a plain (non-template)
    // declaration's own name with its namespace chain by default (see
    // `namespacePrefix`), matching the official
    // `getTypeName`/`getNamespacePrefix` behavior. `NS1.Duplicate1` and
    // `NS2.Duplicate1` compute different candidates, so they no longer
    // collide and no diagnostic is reported.
    const { builder, program, Type1, Type2 } = await compileSchemas(t.code`
      namespace NS1 {
        @test("Type1")
        model Duplicate1 {
          field1: string;
        }
      }
      namespace NS2 {
        @test("Type2")
        model Duplicate1 {
          field2: int32;
        }
      }
    `);
    const ref1 = builder.buildSchema(Type1 as Model) as any;
    const ref2 = builder.buildSchema(Type2 as Model) as any;

    expect(ref1.$ref).toBe("#/components/schemas/NS1.Duplicate1");
    expect(ref2.$ref).toBe("#/components/schemas/NS2.Duplicate1");

    expect(diagnosticsWith(program.diagnostics, "duplicate-schema-key")).toHaveLength(0);
  });

  it("gives a global-namespace model and a namespaced same-named model distinct keys (namespaced built first)", async () => {
    // The global namespace's own prefix is the empty string (see
    // `namespacePrefix`), so `GlobalFoo` keeps the bare "Foo" key while
    // `NsFoo` gets the namespace-qualified "NS2.Foo" key. The two no
    // longer compute the same candidate, regardless of build order.
    const { builder, program, NsFoo, GlobalFoo } = await compileSchemas(t.code`
      namespace NS2 {
        @test("NsFoo")
        model Foo {
          a: string;
        }
      }
      @test("GlobalFoo")
      model Foo {
        b: int32;
      }
    `);
    const ref1 = builder.buildSchema(NsFoo as Model) as any;
    const ref2 = builder.buildSchema(GlobalFoo as Model) as any;

    expect(ref1.$ref).toBe("#/components/schemas/NS2.Foo");
    expect(ref2.$ref).toBe("#/components/schemas/Foo");

    expect(diagnosticsWith(program.diagnostics, "duplicate-schema-key")).toHaveLength(0);
  });

  it("gives a global-namespace model and a namespaced same-named model distinct keys (global built first)", async () => {
    const { builder, program, NsFoo, GlobalFoo } = await compileSchemas(t.code`
      namespace NS2 {
        @test("NsFoo")
        model Foo {
          a: string;
        }
      }
      @test("GlobalFoo")
      model Foo {
        b: int32;
      }
    `);
    const ref1 = builder.buildSchema(GlobalFoo as Model) as any;
    const ref2 = builder.buildSchema(NsFoo as Model) as any;

    expect(ref1.$ref).toBe("#/components/schemas/Foo");
    expect(ref2.$ref).toBe("#/components/schemas/NS2.Foo");

    expect(diagnosticsWith(program.diagnostics, "duplicate-schema-key")).toHaveLength(0);
  });

  it("leaves the service namespace out of a schema key, while still qualifying a namespace nested under it", async () => {
    const { builder, Order, SubOrder } = await compileSchemas(t.code`
      @service(#{ title: "Order Events" })
      namespace MyService;
      @test("Order")
      model Order {
        id: string;
      }
      namespace Sub {
        @test("SubOrder")
        model Order {
          id: int32;
        }
      }
    `);
    const ref1 = builder.buildSchema(Order as Model) as any;
    const ref2 = builder.buildSchema(SubOrder as Model) as any;

    // Nearly every declaration in a single-service spec lives under the
    // service namespace, so it carries no distinguishing information. The
    // official emitters drop it through their own `namespaceFilter`. A
    // namespace nested under it still qualifies the key.
    expect(ref1.$ref).toBe("#/components/schemas/Order");
    expect(ref2.$ref).toBe("#/components/schemas/Sub.Order");
  });

  it("gives two same-named templates in sibling namespaces distinct keys for the same type argument", async () => {
    const { builder, program, M } = await compileSchemas(t.code`
      model Order { id: string; }
      namespace A {
        model Env<T> { a: T; }
      }
      namespace B {
        model Env<T> { b: T; }
      }
      @test("M")
      model M {
        x: A.Env<Order>;
        y: B.Env<Order>;
      }
    `);
    builder.buildSchema(M as Model);
    const props = builder.getSchemas().M.properties as Record<string, any>;

    // A template instantiation is qualified by its own declaring
    // namespace, exactly like a plain declaration. Only the arguments'
    // namespaces would not tell these two apart.
    expect(props.x).toEqual({ $ref: "#/components/schemas/A.EnvOrder" });
    expect(props.y).toEqual({ $ref: "#/components/schemas/B.EnvOrder" });

    expect(diagnosticsWith(program.diagnostics, "duplicate-schema-key")).toHaveLength(0);
  });

  it("should give each template instantiation its own schema key", async () => {
    const { builder, W } = await compileSchemas(t.code`
      namespace NS {
        model Page<T> {
          items: T[];
        }
        @test("W")
        model W {
          a: Page<string>;
          b: Page<int32>;
          c: Page<boolean>;
        }
      }
    `);
    builder.buildSchema(W as Model);

    const components = builder.getSchemas();
    // `W` is itself a plain (non-template) declaration inside `NS`, so its
    // own key is namespace-qualified: "NS.W", not the bare "W".
    const props = components["NS.W"].properties as Record<string, any>;
    const refs = [props.a.$ref, props.b.$ref, props.c.$ref] as string[];
    // Every instantiation of Page<T> is named from the template's own
    // name plus its type argument's display name, and is qualified by its
    // own declaring namespace exactly like a plain declaration. So each
    // instantiation gets its own distinguishable key up front. Two
    // instantiations of one template never compete for a key, and a
    // genuine collision with an unrelated declaration is a hard
    // `duplicate-schema-key` error rather than a silent rename.
    expect(refs).toEqual([
      "#/components/schemas/NS.PageString",
      "#/components/schemas/NS.PageInt32",
      "#/components/schemas/NS.PageBoolean",
    ]);

    const itemTypes = refs.map((ref) => {
      const key = ref.replace("#/components/schemas/", "");
      const schema = components[key] as any;
      return schema.properties.items.items.type as string;
    });
    expect(itemTypes).toEqual(["string", "integer", "boolean"]);
  });

  it("gives two same-named models under different multi-level namespace chains distinct, namespace-qualified keys", async () => {
    const { builder, program, GlobalModel, NestedModel } = await compileSchemas(t.code`
      @test("GlobalModel")
      model Widget {
        a: string;
      }
      namespace Foo {
        namespace Bar {
          @test("NestedModel")
          model Widget {
            b: int32;
          }
        }
      }
    `);
    const ref1 = builder.buildSchema(GlobalModel as Model) as any;
    const ref2 = builder.buildSchema(NestedModel as Model) as any;

    // The global namespace contributes no prefix; the nested chain is
    // joined with '.' and separated from the declaration's own name by a
    // further '.' (see `namespacePrefix`), so the two no longer compute
    // the same candidate.
    expect(ref1.$ref).toBe("#/components/schemas/Widget");
    expect(ref2.$ref).toBe("#/components/schemas/Foo.Bar.Widget");

    expect(diagnosticsWith(program.diagnostics, "duplicate-schema-key")).toHaveLength(0);
  });

  it("keeps a stable $ref, with no diagnostic, when a namespace-qualified model is referenced again from a sibling namespace", async () => {
    const { builder, program, Type1, Type2, Wrapper } = await compileSchemas(t.code`
      namespace NS1 {
        @test("Type1")
        model Duplicate1 {
          field1: string;
        }
      }
      namespace NS2 {
        @test("Type2")
        model Duplicate1 {
          field2: int32;
        }
        @test("Wrapper")
        model Wrapper {
          inner: Duplicate1;
        }
      }
    `);
    builder.buildSchema(Type1 as Model);
    builder.buildSchema(Type2 as Model);
    builder.buildSchema(Wrapper as Model);

    const components = builder.getSchemas();
    // `NS1.Duplicate1` and `NS2.Duplicate1` are namespace-qualified by
    // default, so they no longer collide into one shared key.
    expect(Object.hasOwn(components, "NS1.Duplicate1")).toBe(true);
    expect(Object.hasOwn(components, "NS2.Duplicate1")).toBe(true);
    // `Wrapper` (in `NS2`) is itself namespace-qualified too. Its `inner`
    // property references `NS2.Duplicate1`, its own namespace's type, by
    // its own stable key.
    expect(components["NS2.Wrapper"].properties?.inner).toEqual({
      $ref: "#/components/schemas/NS2.Duplicate1",
    });

    const diagnostics = diagnosticsWith(program.diagnostics, "duplicate-schema-key");
    expect(diagnostics).toHaveLength(0);
  });

  it("resolves same-named models from different namespaces to distinct keys regardless of referencing-property order", async () => {
    // Under the old first-come-first-served/hard-error policies, the
    // *order* two colliding properties were visited in used to matter.
    // Under default namespace-qualified naming there is no collision at
    // all to race over: each property's namespace-qualified key is fixed
    // by its own declaring namespace, independent of visitation order.
    const { builder, program, W } = await compileSchemas(t.code`
      namespace NS1 { model Foo { a: string; } }
      namespace NS2 { model Foo { b: int32; } }
      model ${t.model("W")} {
        x: NS2.Foo;
        y: NS1.Foo;
      }
    `);
    builder.buildSchema(W);

    const props = builder.getSchemas().W.properties as Record<string, any>;
    expect(props.x).toEqual({ $ref: "#/components/schemas/NS2.Foo" });
    expect(props.y).toEqual({ $ref: "#/components/schemas/NS1.Foo" });

    const diagnostics = diagnosticsWith(program.diagnostics, "duplicate-schema-key");
    expect(diagnostics).toHaveLength(0);
  });

  it("resolves a namespace-qualified name the same way when one namespace is declared blockless", async () => {
    // `namespace Foo;` (no braces) must be the file's first statement. It
    // puts every following top-level declaration into `Foo`, the same way
    // `namespace Foo { ... }` would. `Bar` is then a nested block
    // namespace inside `Foo`. Symbol resolution, and so the namespace
    // chain `namespacePrefix` walks, must not depend on which namespace
    // syntax produced it.
    const { builder, program, FooWidget, BarWidget } = await compileSchemas(t.code`
      namespace Foo;
      @test("FooWidget")
      model Widget {
        a: string;
      }
      namespace Bar {
        @test("BarWidget")
        model Widget {
          b: int32;
        }
      }
    `);
    const ref1 = builder.buildSchema(FooWidget as Model) as any;
    const ref2 = builder.buildSchema(BarWidget as Model) as any;

    expect(ref1.$ref).toBe("#/components/schemas/Foo.Widget");
    expect(ref2.$ref).toBe("#/components/schemas/Foo.Bar.Widget");

    expect(diagnosticsWith(program.diagnostics, "duplicate-schema-key")).toHaveLength(0);
  });

  it("should Sep-encode a backtick-declared model's own name so it can't leak a character outside the AsyncAPI key charset", async () => {
    const { builder, M } = await compileSchemas(t.code`
      model \`Foo/Bar\` { x: string; }
      @test("M")
      model M { field: \`Foo/Bar\`; }
    `);
    builder.buildSchema(M as Model);
    const props = builder.getSchemas().M.properties as Record<string, any>;
    const key = String(props.field.$ref).replace("#/components/schemas/", "");

    expect(key).toMatch(/^[a-zA-Z0-9.\-_]+$/);
    expect(Object.hasOwn(builder.getSchemas(), key)).toBe(true);
    // '/' (code point 47) is Sep-encoded the same way it already is for a
    // literal template argument's own text.
    expect(key).toBe("FooSep47Bar");
  });

  it("should Sep-encode a backtick-declared enum's own name so it can't leak a character outside the AsyncAPI key charset", async () => {
    const { builder, M } = await compileSchemas(t.code`
      enum \`Foo/Bar\` { A, B }
      @test("M")
      model M { field: \`Foo/Bar\`; }
    `);
    builder.buildSchema(M as Model);
    const props = builder.getSchemas().M.properties as Record<string, any>;
    const key = String(props.field.$ref).replace("#/components/schemas/", "");

    expect(key).toMatch(/^[a-zA-Z0-9.\-_]+$/);
    expect(Object.hasOwn(builder.getSchemas(), key)).toBe(true);
  });

  it("should use @friendlyName's resolved, interpolated name as the components.schemas key for a template instantiation", async () => {
    const { builder, W } = await compileSchemas(t.code`
      @friendlyName("{name}Envelope", T)
      model Envelope<T> {
        data: T;
      }
      model Order {
        id: string;
      }
      @test("W")
      model W {
        order: Envelope<Order>;
      }
    `);
    builder.buildSchema(W as Model);
    const components = builder.getSchemas();
    const props = components.W.properties as Record<string, any>;

    // `@friendlyName("{name}Envelope")` resolves `{name}` to the type
    // argument's own name, `Order`, giving `OrderEnvelope` rather than the
    // structural `EnvelopeOrder`.
    expect(props.order.$ref).toBe("#/components/schemas/OrderEnvelope");
    expect(components.OrderEnvelope).toBeDefined();
    expect(components.EnvelopeOrder).toBeUndefined();
  });

  it("should report duplicate-schema-key when two template instantiations resolve to the same @friendlyName", async () => {
    const { builder, program, W } = await compileSchemas(t.code`
      @friendlyName("Wrapped")
      model Envelope<T> {
        data: T;
      }
      model Order { id: string; }
      model Invoice { id: string; }
      @test("W")
      model W {
        order: Envelope<Order>;
        invoice: Envelope<Invoice>;
      }
    `);
    builder.buildSchema(W as Model);
    const diagnostic = findDiagnostic(program.diagnostics, "duplicate-schema-key");
    expect(diagnostic).toBeDefined();
    expect(diagnostic.severity).toBe("error");
  });

  it("should still use the structural name for a template instantiation with no @friendlyName", async () => {
    const { builder, W } = await compileSchemas(t.code`
      model Envelope<T> {
        data: T;
      }
      model Order {
        id: string;
      }
      @test("W")
      model W {
        order: Envelope<Order>;
      }
    `);
    builder.buildSchema(W as Model);
    const components = builder.getSchemas();
    const props = components.W.properties as Record<string, any>;

    expect(props.order.$ref).toBe("#/components/schemas/EnvelopeOrder");
    expect(components.EnvelopeOrder).toBeDefined();
  });

  it("should leave the owner in place when releasing a type that lost the key collision", async () => {
    // Two declarations forced onto one candidate name collide. The first
    // one becomes the owner and the second only records the key for
    // itself. Releasing the loser must not evict the winner, so the
    // ownership check takes its false side here.
    const { program, First, Second } = await compileSchemas(t.code`
      namespace NS {
        @friendlyName("Shared")
        model ${t.model("First")} { a: string; }
        @friendlyName("Shared")
        model ${t.model("Second")} { b: string; }
      }
    `);
    const registry = new SchemaKeyRegistry(program);

    expect(registry.keyFor(First)).toBe("Shared");
    expect(registry.keyFor(Second)).toBe("Shared");
    expect(registry.ownerOf("Shared")).toBe(First);

    registry.release(Second);

    expect(registry.ownerOf("Shared")).toBe(First);
  });

  it("should use @friendlyName's resolved name as the components.schemas key for an enum", async () => {
    const { builder, M } = await compileSchemas(t.code`
      @friendlyName("Renamed")
      enum Color { Red, Green }
      @test("M")
      model M { color: Color; }
    `);
    builder.buildSchema(M as Model);
    const components = builder.getSchemas();
    const props = components.M.properties as Record<string, any>;

    expect(props.color.$ref).toBe("#/components/schemas/Renamed");
    expect(components.Renamed).toBeDefined();
    expect(components.Color).toBeUndefined();
  });
});
