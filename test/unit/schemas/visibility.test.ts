/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect } from "vitest";
import { compileSchemasWithDiagnostics } from "../../utils/schema-host.js";
import { t } from "@typespec/compiler/testing";

/**
 * An AsyncAPI message has one shape. It is not read, created, and updated in
 * separate phases, so there is no phase for this emitter to choose when a
 * property is only visible in some of them.
 *
 * That splits the visibility decorators in two. `@invisible` needs no phase to
 * interpret and is honoured. A partial `@visibility` cannot be honoured, so it
 * is reported instead of being dropped without a word.
 */
describe("Unit: Schemas — visibility", () => {
  async function build(body: string) {
    const context = await compileSchemasWithDiagnostics(t.code`
      ${body}
      model ${t.model("M")} {
        target: Holder;
      }
    `);
    context.builder.buildSchema(context.M);
    const holder = context.builder.getSchemas().Holder as any;
    return { holder, diagnostics: context.diagnostics };
  }

  it("leaves an @invisible property out of the schema", async () => {
    const { holder, diagnostics } = await build(`
      model Holder {
        shown: string;
        @invisible(Lifecycle) hidden: string;
      }
    `);

    // The author said this property is in no phase at all. Emitting it would
    // put a field in the contract that was explicitly withheld.
    expect(Object.keys(holder.properties as object)).toEqual(["shown"]);
    expect(holder.required).toEqual(["shown"]);
    // Honouring the decorator is not a compromise, so there is nothing to
    // report.
    expect(diagnostics).toEqual([]);
  });

  it("omits an @invisible property without emptying the schema", async () => {
    const { holder } = await build(`
      model Holder {
        @invisible(Lifecycle) hidden: string;
      }
    `);

    // Every property being hidden leaves an object with no properties, not a
    // `properties: {}` entry.
    expect(holder).toEqual({ type: "object" });
  });

  it("emits a partially visible property and reports it", async () => {
    const { holder, diagnostics } = await build(`
      model Holder {
        @visibility(Lifecycle.Read) serverAssigned: string;
      }
    `);

    // The property is emitted in full, because there is no other shape to put
    // it in.
    expect(holder.properties.serverAssigned).toEqual({ type: "string" });
    expect(holder.required).toEqual(["serverAssigned"]);
    // Staying silent here would leave the author believing the field is
    // restricted while the document shows it to every reader.
    expect(diagnostics.map((d) => d.code)).toEqual(["tsp-asyncapi/visibility-not-applied"]);
  });

  it("reports each restricted property once", async () => {
    const { diagnostics } = await build(`
      model Holder {
        @visibility(Lifecycle.Read) a: string;
        @visibility(Lifecycle.Create) b: string;
      }
    `);

    expect(diagnostics.map((d) => d.code)).toEqual([
      "tsp-asyncapi/visibility-not-applied",
      "tsp-asyncapi/visibility-not-applied",
    ]);
  });

  it("does not report a property visible in every phase", async () => {
    const { holder, diagnostics } = await build(`
      model Holder {
        @visibility(
          Lifecycle.Create,
          Lifecycle.Read,
          Lifecycle.Update,
          Lifecycle.Delete,
          Lifecycle.Query
        )
        everywhere: string;
      }
    `);

    // Naming every phase restricts nothing, so nothing was dropped and there
    // is nothing to report.
    expect(holder.properties.everywhere).toEqual({ type: "string" });
    expect(diagnostics).toEqual([]);
  });

  it("does not report a property with no visibility decorator", async () => {
    const { holder, diagnostics } = await build(`
      model Holder {
        plain: string;
      }
    `);

    expect(holder.properties.plain).toEqual({ type: "string" });
    expect(diagnostics).toEqual([]);
  });

  it("omits an @invisible property declared on a base model", async () => {
    const context = await compileSchemasWithDiagnostics(t.code`
      model Base {
        @invisible(Lifecycle) secret: string;
        kept: string;
      }
      model Holder extends Base {
        own: string;
      }
      model ${t.model("M")} {
        target: Holder;
      }
    `);
    context.builder.buildSchema(context.M);
    const schemas = context.builder.getSchemas() as unknown as Record<string, any>;

    // A derived model refers to its base through `allOf`, so the base keeps
    // its own component. The omission has to happen there, or the hidden
    // property reaches the document through the reference.
    expect(Object.keys(schemas.Base.properties as object)).toEqual(["kept"]);
    expect(schemas.Base.required).toEqual(["kept"]);
    expect(schemas.Holder.allOf[0]).toEqual({ $ref: "#/components/schemas/Base" });
    expect(Object.keys(schemas.Holder.allOf[1].properties as object)).toEqual(["own"]);
  });
});
