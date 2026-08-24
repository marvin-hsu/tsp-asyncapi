import { describe, it, expect } from "vitest";
import {
  compileSchemas,
  compileSchemasWithDiagnostics,
  holderProperties,
} from "../../../utils/schema-host.js";
import { t } from "@typespec/compiler/testing";
import { present, schemaOf } from "../../../utils/document.js";
import type { SchemaObject } from "#emitter/types/index.js";
import { resolvedProperties } from "../../../utils/schema-host.js";

/**
 * The keywords that describe a value without constraining it: `default`,
 * `deprecated`, and the `password` format `@secret` maps to.
 *
 * Each of these was written by the author and has to reach the document. A
 * property that carries one and emits nothing tells the reader less than the
 * source says.
 */
describe("Unit: Schemas — annotations", () => {
  describe("@secret", () => {
    it("maps to the password format", async () => {
      const props = await holderProperties(`
        model Holder {
          @secret token: string;
        }
      `);

      expect(props.token).toEqual({ type: "string", format: "password" });
    });

    it("lets an explicit @format win", async () => {
      const props = await holderProperties(`
        model Holder {
          @secret @format("uuid") id: string;
        }
      `);

      // `@secret` says the value is sensitive. `@format` says what the value
      // is, which is the more specific statement, so it wins.
      expect(props.id).toEqual({ type: "string", format: "uuid" });
    });

    it("applies to a scalar declaration", async () => {
      const props = await holderProperties(`
        @secret scalar Password extends string;
        model Holder {
          p: Password;
        }
      `);

      expect(props.p).toEqual({ type: "string", format: "password" });
    });
  });

  describe("default values", () => {
    it("emits a string default", async () => {
      const props = await holderProperties(`
        model Holder {
          greeting?: string = "hello";
        }
      `);

      expect(props.greeting).toEqual({ type: "string", default: "hello" });
    });

    it("emits a numeric default", async () => {
      const props = await holderProperties(`
        model Holder {
          retries?: int32 = 3;
        }
      `);

      expect(props.retries).toEqual({ type: "integer", format: "int32", default: 3 });
    });

    it("emits a boolean default", async () => {
      const props = await holderProperties(`
        model Holder {
          enabled?: boolean = false;
        }
      `);

      // `false` is a real default. A truthiness check would drop it.
      expect(props.enabled).toEqual({ type: "boolean", default: false });
    });

    it("emits an enum member default", async () => {
      const props = await holderProperties(`
        enum Level { Low: "low", High: "high" }
        model Holder {
          level?: Level = Level.Low;
        }
      `);

      expect(schemaOf(props.level).default).toBe("low");
    });

    it("keeps a default alongside the property's own constraints", async () => {
      const props = await holderProperties(`
        model Holder {
          @minLength(2) name?: string = "ab";
        }
      `);

      expect(props.name).toEqual({ type: "string", minLength: 2, default: "ab" });
    });

    it("reports a default the serializer cannot represent, and omits it", async () => {
      const { builder, M, diagnostics } = await compileSchemasWithDiagnostics(t.code`
        scalar ipv4 extends string {
          init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
        }
        model ${t.model("M")} {
          ip?: ipv4 = ipv4.fromBytes(127, 0, 0, 1);
        }
      `);
      builder.buildSchema(M);

      const props = resolvedProperties(builder, "M");
      // A half-serialized default would put a value in the schema that the
      // schema itself rejects, so the keyword is left out entirely.
      expect("default" in props.ip).toBe(false);
      // Dropping it in silence would leave the author believing the default
      // reached the document.
      expect(diagnostics.map((d) => d.code)).toEqual(["tsp-asyncapi/unserializable-default"]);
      expect(diagnostics[0].severity).toBe("warning");
    });

    it("emits no default for a property that has none", async () => {
      const props = await holderProperties(`
        model Holder {
          name?: string;
        }
      `);

      expect(props.name).toEqual({ type: "string" });
      expect("default" in props.name).toBe(false);
    });
  });

  describe("@externalDocs", () => {
    // AsyncAPI's Schema Object adds exactly three fields on top of JSON Schema
    // draft-07: `discriminator`, `deprecated`, and `externalDocs`. The first
    // two already reach the document, so a link written on a model that no
    // message names had nowhere to go.
    it("reaches a model's own schema", async () => {
      const { builder, M } = await compileSchemas(t.code`
        @externalDocs("https://example.com/nested", "Nested docs")
        model Nested {
          a: string;
        }
        model ${t.model("M")} {
          n: Nested;
        }
      `);
      builder.buildSchema(M);
      const schemas = builder.getSchemas();

      expect(schemas.Nested.externalDocs).toEqual({
        url: "https://example.com/nested",
        description: "Nested docs",
      });
    });

    it("reaches a scalar's use site", async () => {
      const props = await holderProperties(`
        @externalDocs("https://example.com/code")
        scalar Code extends string;
        model Holder {
          c: Code;
        }
      `);

      // The decorator is on the scalar, so it has to travel down the
      // `baseScalar` chain to the property that uses it.
      expect(schemaOf(props.c).externalDocs).toEqual({ url: "https://example.com/code" });
    });

    it("reaches a property of its own", async () => {
      const props = await holderProperties(`
        model Holder {
          @externalDocs("https://example.com/prop", "Prop docs")
          p: string;
        }
      `);

      expect(schemaOf(props.p).externalDocs).toEqual({
        url: "https://example.com/prop",
        description: "Prop docs",
      });
    });

    it("omits the description when none was given", async () => {
      const props = await holderProperties(`
        model Holder {
          @externalDocs("https://example.com/only-url")
          p: string;
        }
      `);

      const onlyUrl = present(schemaOf(props.p).externalDocs, "externalDocs");
      expect(onlyUrl.url).toBe("https://example.com/only-url");
      expect(onlyUrl.description).toBeUndefined();
    });

    it("stays outside the allOf when the property wraps its scalar", async () => {
      const props = await holderProperties(`
        @minLength(5)
        scalar Tight extends string;
        model Holder {
          @minLength(2)
          @externalDocs("https://example.com/wrapped", "Wrapped docs")
          p: Tight;
        }
      `);

      // A property re-declaring a keyword its scalar already carries makes the
      // builder wrap the scalar's shape in `allOf`, so both constraints hold.
      expect(schemaOf(props.p).allOf).toBeDefined();
      // `externalDocs` describes the value, it does not constrain it. Left
      // inside the `allOf` branch, a reader looking at this property would
      // never see the link.
      expect(schemaOf(props.p).externalDocs).toEqual({
        url: "https://example.com/wrapped",
        description: "Wrapped docs",
      });
      // The branch is a schema rather than a reference here, and that is the
      // claim: the wrapper carries the docs, the branch does not.
      const branch = present(schemaOf(props.p).allOf, "allOf")[0] as SchemaObject;
      expect(branch.externalDocs).toBeUndefined();
    });

    it("emits nothing for a target with no @externalDocs", async () => {
      const props = await holderProperties(`
        model Holder {
          p: string;
        }
      `);

      expect("externalDocs" in props.p).toBe(false);
    });
  });

  describe("#deprecated", () => {
    it("marks a deprecated property", async () => {
      const props = await holderProperties(`
        model Holder {
          #deprecated "use fullName instead"
          name?: string;
        }
      `);

      expect(props.name).toEqual({ type: "string", deprecated: true });
    });

    it("marks a deprecated scalar at its use site", async () => {
      const { builder, M, diagnostics } = await compileSchemasWithDiagnostics(t.code`
        #deprecated "use Email instead"
        scalar OldEmail extends string;
        model ${t.model("M")} {
          e: OldEmail;
        }
      `);
      builder.buildSchema(M);

      // The compiler warns at the use site of a deprecated declaration. That
      // warning is the message `#deprecated` carries; JSON Schema's
      // `deprecated` keyword is a bare boolean with nowhere to put it.
      expect(diagnostics.map((d) => d.code)).toEqual(["deprecated"]);
      const props = resolvedProperties(builder, "M");
      expect(props.e).toEqual({ type: "string", deprecated: true });
    });

    it("emits no deprecated keyword for a property that is not deprecated", async () => {
      const props = await holderProperties(`
        model Holder {
          name?: string;
        }
      `);

      expect("deprecated" in props.name).toBe(false);
    });

    it("marks a deprecated model declaration", async () => {
      const { builder, M } = await compileSchemasWithDiagnostics(t.code`
        #deprecated "use V2 instead"
        model Old {
          a: string;
        }
        model ${t.model("M")} {
          old: Old;
        }
      `);
      builder.buildSchema(M);

      const old = builder.getSchemas().Old;
      expect(old.deprecated).toBe(true);
    });
  });
});
