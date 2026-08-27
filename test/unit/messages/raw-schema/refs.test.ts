import { describe, it, expect, beforeEach } from "vitest";
import { AsyncAPITester } from "#emitter/testing.js";
import { TesterInstance } from "@typespec/compiler/testing";
import type { Model, Program } from "@typespec/compiler";
import { reportUnresolvedRawSchemaRefs } from "#emitter/lower/raw-schema-refs.js";
import { namespaceOf } from "../../../utils/namespace.js";
import { ASYNCAPI_VERSION } from "#core/constants.js";
import { diagnosticsWith, findDiagnostic } from "../../../utils/diagnostics.js";
import { documentFrom } from "../../../utils/test-host.js";

/** The AsyncAPI Schema Object format, in its JSON flavour. */
const NATIVE = `application/vnd.aai.asyncapi+json;version=${ASYNCAPI_VERSION}`;

/** The code of the rule this file is about. */
const CODE = "unresolved-raw-schema-ref";

/**
 * Finds one model of the compiled source by name.
 *
 * @param program - The compiled program
 * @param name - The name the source gives the model
 * @returns That model
 */
function modelOf(program: Program, name: string): Model {
  const model = namespaceOf(program, "Test").models.get(name);
  if (model === undefined) {
    throw new Error(`The compiled program declares no model named '${name}'.`);
  }
  return model;
}

describe("Unit: Message raw schemas: local $ref targets (Phase 3.9)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("reports a local $ref that reaches nothing, and emits the schema", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${NATIVE}", #{ \`$ref\`: "#/components/schemas/Nope" })
      model OrderCreated {}
    `);

    const doc = await documentFrom(runner.program);

    const reported = findDiagnostic(runner.program.diagnostics, CODE);
    expect(reported.severity).toBe("error");
    expect(reported.message).toContain("#/components/schemas/Nope");

    // The schema still reaches the document. The author decides what to
    // change, and nothing written disappears while the error is open.
    expect(doc.components?.messages?.OrderCreated.payload).toEqual({
      schemaFormat: NATIVE,
      schema: { $ref: "#/components/schemas/Nope" },
    });
  });

  it("reports a raw model that refers to its own name", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${NATIVE}", #{ \`$ref\`: "#/components/schemas/OrderCreated" })
      model OrderCreated {
        id: string;
      }
    `);

    await documentFrom(runner.program);

    // This is the trap the rule exists for. A @rawPayload model stops being a
    // root of the schema walk, so it claims no key of its own. The obvious
    // target therefore holds nothing.
    const reported = findDiagnostic(runner.program.diagnostics, CODE);
    expect(reported.message).toContain("#/components/schemas/OrderCreated");
  });

  it("accepts the same reference once another message reaches that model", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${NATIVE}", #{ \`$ref\`: "#/components/schemas/OrderCreated" })
      model OrderCreated {
        id: string;
      }

      @message
      model Wrapper {
        order: OrderCreated;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(doc.components?.schemas?.OrderCreated).toBeDefined();
    expect(diagnosticsWith(runner.program.diagnostics, CODE)).toHaveLength(0);
  });

  it("resolves a reference into a section other than components.schemas", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Other {
        id: string;
      }

      @message
      @rawPayload("${NATIVE}", #{ \`$ref\`: "#/components/messages/Other" })
      model OrderCreated {}
    `);

    await documentFrom(runner.program);

    // The whole document is the resolution root, not one section of it.
    expect(diagnosticsWith(runner.program.diagnostics, CODE)).toHaveLength(0);
  });

  it("reports the same rule for @rawHeaders", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawHeaders("${NATIVE}", #{ \`$ref\`: "#/components/schemas/Missing" })
      model OrderCreated {
        id: string;
      }
    `);

    await documentFrom(runner.program);

    const reported = findDiagnostic(runner.program.diagnostics, CODE);
    expect(reported.message).toContain("#/components/schemas/Missing");
  });

  it("says nothing about a reference to another document", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${NATIVE}", #{ \`$ref\`: "https://example.com/order.json" })
      model OrderCreated {}
    `);

    await documentFrom(runner.program);

    // The target sits outside this document. A registry or a file holds it,
    // and the emitter cannot read either one.
    expect(diagnosticsWith(runner.program.diagnostics, CODE)).toHaveLength(0);
  });

  it("says nothing about a $ref nested inside the schema", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${NATIVE}", #{ properties: #{ order: #{ \`$ref\`: "#/components/schemas/Nope" } } })
      model OrderCreated {}
    `);

    await documentFrom(runner.program);

    // A nested reference is written in the schema language itself, and the
    // emitter does not know that grammar. Only the top level is read.
    expect(diagnosticsWith(runner.program.diagnostics, CODE)).toHaveLength(0);
  });

  it("says nothing about an ordinary payload that refers to a component", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }
    `);

    await documentFrom(runner.program);

    // Every reference the emitter writes itself resolves by construction.
    expect(diagnosticsWith(runner.program.diagnostics, CODE)).toHaveLength(0);
  });

  it("resolves a reference into an array element", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @asyncTag("public")
      model Other {
        id: string;
      }

      @message
      @rawPayload("${NATIVE}", #{ \`$ref\`: "#/components/messages/Other/tags/0" })
      model OrderCreated {}
    `);

    await documentFrom(runner.program);

    // A pointer token is an array index as well as an object key. An index
    // outside the array is a miss, and an index inside it is a hit.
    expect(diagnosticsWith(runner.program.diagnostics, CODE)).toHaveLength(0);
  });

  it("resolves a percent-encoded reference", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Other {
        id: string;
      }

      @message
      @rawPayload("${NATIVE}", #{ \`$ref\`: "#/components/messages/%4Fther" })
      model OrderCreated {}
    `);

    await documentFrom(runner.program);

    // A pointer travels in the fragment of a URI, so it can carry
    // percent-encoding. `%4F` is `O`. A parser accepts this reference, so the
    // emitter must not report it.
    expect(diagnosticsWith(runner.program.diagnostics, CODE)).toHaveLength(0);
  });

  it("reports a reference whose stray percent decodes to nothing", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${NATIVE}", #{ \`$ref\`: "#/components/schemas/%E0" })
      model OrderCreated {}
    `);

    await documentFrom(runner.program);

    // The text is not percent-encoding at all, so the text itself is the key,
    // and the document holds no such key.
    const reported = findDiagnostic(runner.program.diagnostics, CODE);
    expect(reported.message).toContain("#/components/schemas/%E0");
  });

  it("reports an array index the document does not hold", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @asyncTag("public")
      model Other {
        id: string;
      }

      @message
      @rawPayload("${NATIVE}", #{ \`$ref\`: "#/components/messages/Other/tags/7" })
      model OrderCreated {}
    `);

    await documentFrom(runner.program);

    const reported = findDiagnostic(runner.program.diagnostics, CODE);
    expect(reported.message).toContain("#/components/messages/Other/tags/7");
  });
  it("passes over a key the document holds no message for", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }
    `);

    const doc = await documentFrom(runner.program);
    const model = modelOf(runner.program, "OrderCreated");

    // Every key of the map names an emitted message, which the rule reads a
    // slot of. The guard states that invariant: a key the document lost
    // reports nothing, rather than failing on a message that is not there.
    expect(() => {
      reportUnresolvedRawSchemaRefs(runner.program, doc, new Map<Model, string>([[model, "Gone"]]));
    }).not.toThrow();
    expect(diagnosticsWith(runner.program.diagnostics, CODE)).toHaveLength(0);
  });
});
