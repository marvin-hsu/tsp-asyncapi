/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect } from "vitest";
import { compileSchemas, compileSchemasWithDiagnostics } from "../../utils/schema-host.js";
import { t } from "@typespec/compiler/testing";

/**
 * The keywords that describe a value without constraining it: `default`,
 * `deprecated`, and the `password` format `@secret` maps to.
 *
 * Each of these was written by the author and has to reach the document. A
 * property that carries one and emits nothing tells the reader less than the
 * source says.
 */
describe("Unit: Schemas — annotations", () => {
  async function propertiesOf(body: string): Promise<Record<string, any>> {
    const { builder, M } = await compileSchemas(t.code`
      ${body}
      model ${t.model("M")} {
        target: Holder;
      }
    `);
    builder.buildSchema(M);
    return builder.getSchemas().Holder.properties as Record<string, any>;
  }

  describe("@secret", () => {
    it("maps to the password format", async () => {
      const props = await propertiesOf(`
        model Holder {
          @secret token: string;
        }
      `);

      expect(props.token).toEqual({ type: "string", format: "password" });
    });

    it("lets an explicit @format win", async () => {
      const props = await propertiesOf(`
        model Holder {
          @secret @format("uuid") id: string;
        }
      `);

      // `@secret` says the value is sensitive. `@format` says what the value
      // is, which is the more specific statement, so it wins.
      expect(props.id).toEqual({ type: "string", format: "uuid" });
    });

    it("applies to a scalar declaration", async () => {
      const props = await propertiesOf(`
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
      const props = await propertiesOf(`
        model Holder {
          greeting?: string = "hello";
        }
      `);

      expect(props.greeting).toEqual({ type: "string", default: "hello" });
    });

    it("emits a numeric default", async () => {
      const props = await propertiesOf(`
        model Holder {
          retries?: int32 = 3;
        }
      `);

      expect(props.retries).toEqual({ type: "integer", format: "int32", default: 3 });
    });

    it("emits a boolean default", async () => {
      const props = await propertiesOf(`
        model Holder {
          enabled?: boolean = false;
        }
      `);

      // `false` is a real default. A truthiness check would drop it.
      expect(props.enabled).toEqual({ type: "boolean", default: false });
    });

    it("emits an enum member default", async () => {
      const props = await propertiesOf(`
        enum Level { Low: "low", High: "high" }
        model Holder {
          level?: Level = Level.Low;
        }
      `);

      expect(props.level.default).toBe("low");
    });

    it("keeps a default alongside the property's own constraints", async () => {
      const props = await propertiesOf(`
        model Holder {
          @minLength(2) name?: string = "ab";
        }
      `);

      expect(props.name).toEqual({ type: "string", minLength: 2, default: "ab" });
    });

    it("emits no default for a property that has none", async () => {
      const props = await propertiesOf(`
        model Holder {
          name?: string;
        }
      `);

      expect(props.name).toEqual({ type: "string" });
      expect("default" in props.name).toBe(false);
    });
  });

  describe("#deprecated", () => {
    it("marks a deprecated property", async () => {
      const props = await propertiesOf(`
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
      const props = builder.getSchemas().M.properties as Record<string, any>;
      expect(props.e).toEqual({ type: "string", deprecated: true });
    });

    it("emits no deprecated keyword for a property that is not deprecated", async () => {
      const props = await propertiesOf(`
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

      const old = builder.getSchemas().Old as any;
      expect(old.deprecated).toBe(true);
    });
  });
});
