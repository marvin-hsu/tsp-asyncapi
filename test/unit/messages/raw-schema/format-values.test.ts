import { describe, it, expect, beforeEach } from "vitest";
import { AsyncAPITester } from "../../../../src/testing/index.js";
import { TesterInstance } from "@typespec/compiler/testing";
import { buildAsyncAPIDocument } from "../../../../src/pipeline.js";
import {
  ASYNCAPI_VERSION,
  MULTI_FORMAT_SCHEMA_FORMATS,
  NON_JSON_SCHEMA_FORMATS,
} from "../../../../src/constants.js";
import { diagnosticsWith, findDiagnostic, targetText } from "../../../utils/diagnostics.js";

/** The Avro format identifier AsyncAPI recommends. */
const AVRO = "application/vnd.apache.avro;version=1.9.0";

describe("Unit: Message raw schemas: schemaFormat values (Phase 3.9)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("lists exactly the identifiers of the AsyncAPI 3.1.0 schema format tables", () => {
    // Every identifier is written out by hand here. The cases below derive
    // themselves from the constant, so they accept whatever it holds. This is
    // the one place that says what it must hold. A typo in a spec identifier
    // or an invented value fails here.
    //
    // The first table is the one every implementation MUST support. The
    // second is the one every implementation is RECOMMENDED to support.
    expect(MULTI_FORMAT_SCHEMA_FORMATS).toEqual([
      "application/vnd.aai.asyncapi;version=3.1.0",
      "application/vnd.aai.asyncapi+json;version=3.1.0",
      "application/vnd.aai.asyncapi+yaml;version=3.1.0",
      "application/schema+json;version=draft-07",
      "application/schema+yaml;version=draft-07",
      "application/vnd.apache.avro;version=1.9.0",
      "application/vnd.apache.avro+json;version=1.9.0",
      "application/vnd.apache.avro+yaml;version=1.9.0",
      "application/vnd.oai.openapi;version=3.0.0",
      "application/vnd.oai.openapi+json;version=3.0.0",
      "application/vnd.oai.openapi+yaml;version=3.0.0",
      "application/raml+yaml;version=1.0",
      "application/vnd.google.protobuf;version=2",
      "application/vnd.google.protobuf;version=3",
    ]);
  });

  it("names the AsyncAPI formats at the version the document declares", () => {
    // The three AsyncAPI entries move with the emitted release. The default
    // `schemaFormat` of a document is the `+json` one, so a document that
    // states its own native format must not be warned about.
    for (const suffix of ["", "+json", "+yaml"]) {
      expect(MULTI_FORMAT_SCHEMA_FORMATS).toContain(
        `application/vnd.aai.asyncapi${suffix};version=${ASYNCAPI_VERSION}`,
      );
    }
  });

  it("warns about an AsyncAPI format from another release", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("application/vnd.aai.asyncapi+json;version=3.0.0", #{ type: "object" })
      model OrderCreated {}
    `);

    // The table of the emitted release names 3.1.0, so 3.0.0 is outside it.
    const reported = findDiagnostic(diagnostics, "unknown-schema-format");
    expect(reported.severity).toBe("warning");
  });

  it.each(MULTI_FORMAT_SCHEMA_FORMATS)("accepts the listed format %s", async (format) => {
    // A non-JSON format takes its schema as a string. The rule below covers
    // the object form of it, so this case gives each format a schema the
    // format itself allows.
    const schema = NON_JSON_SCHEMA_FORMATS.includes(format)
      ? `"message Order {}"`
      : `#{ type: "record" }`;
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${format}", ${schema})
      model OrderCreated {}
    `);

    expect(diagnostics).toHaveLength(0);
    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    expect(doc.components?.messages?.OrderCreated.payload).toEqual({
      schemaFormat: format,
      schema: NON_JSON_SCHEMA_FORMATS.includes(format) ? "message Order {}" : { type: "record" },
    });
  });

  it("reports a string schema for a JSON based format, and emits it", async () => {
    const format = "application/vnd.apache.avro;version=1.9.0";
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${format}", "{ \\"type\\": \\"record\\" }")
      model OrderCreated {}
    `);

    // The other half of the same sentence in the specification. A JSON based
    // language has an object form, and the schema must be inlined as one
    // rather than as text waiting to be parsed. Only the non-JSON direction
    // was checked before, so a string reached the document and the official
    // parser rejected it while this emitter exited clean.
    const reported = findDiagnostic(diagnostics, "string-raw-schema");
    expect(reported.severity).toBe("error");
    expect(reported.message).toContain(format);
    expect(targetText(reported)).toBe(`"{ \\"type\\": \\"record\\" }"`);
  });

  it.each(NON_JSON_SCHEMA_FORMATS)(
    "reports an object schema for %s, and emits it",
    async (format) => {
      const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${format}", #{ type: "record" })
      model OrderCreated {}
    `);

      // AsyncAPI states that a non-JSON schema MUST be inlined as a string.
      const reported = findDiagnostic(diagnostics, "non-string-raw-schema");
      expect(reported.severity).toBe("error");
      expect(reported.message).toContain(format);
      // The squiggle sits on the schema argument, not on the format.
      expect(targetText(reported)).toBe(`#{ type: "record" }`);

      // The value is still written, so neither half disappears from the
      // document while the error is open.
      const doc = buildAsyncAPIDocument(runner.program, undefined, {});
      expect(doc.components?.messages?.OrderCreated.payload).toEqual({
        schemaFormat: format,
        schema: { type: "record" },
      });
    },
  );

  it("reports an object headers schema for a non-JSON format", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawHeaders("application/vnd.google.protobuf;version=3", #{ type: "record" })
      model OrderCreated {}
    `);

    // Both slots share one definition of the rule.
    expect(findDiagnostic(diagnostics, "non-string-raw-schema").severity).toBe("error");
  });

  it("reports nothing for an array schema of a JSON based format", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${AVRO}", #["string", "null"])
      model OrderCreated {}
    `);

    // Avro is JSON based, and a union schema is a JSON array. The string rule
    // covers the non-JSON formats only.
    expect(diagnostics).toHaveLength(0);
  });

  it("reports a local $ref inside a schema of another format, and emits it", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Other {
        id: string;
      }

      @message
      @rawPayload("application/schema+json;version=draft-07", #{ \`$ref\`: "#/components/schemas/Other" })
      model OrderCreated {}
    `);

    // AsyncAPI requires both ends of a $ref to carry the same schemaFormat.
    // The target is an AsyncAPI Schema Object, so draft-07 disagrees with it.
    const reported = findDiagnostic(diagnostics, "raw-schema-local-ref");
    expect(reported.severity).toBe("error");
    expect(reported.message).toContain("#/components/schemas/Other");
    expect(reported.message).toContain("application/schema+json;version=draft-07");

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    expect(doc.components?.messages?.OrderCreated.payload).toEqual({
      schemaFormat: "application/schema+json;version=draft-07",
      schema: { $ref: "#/components/schemas/Other" },
    });
  });

  it("accepts a local $ref inside a schema of the native format", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Other {
        id: string;
      }

      @message
      @rawPayload("application/vnd.aai.asyncapi+json;version=${ASYNCAPI_VERSION}", #{ \`$ref\`: "#/components/schemas/Other" })
      model OrderCreated {}
    `);

    // Both ends are AsyncAPI Schema Objects here, so the two formats agree.
    expect(diagnostics).toHaveLength(0);
  });

  it("accepts a $ref to another document", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("application/schema+json;version=draft-07", #{ \`$ref\`: "https://example.com/order.json" })
      model OrderCreated {}
    `);

    // The target sits outside this document, so the emitter cannot know its
    // schemaFormat. Only a reference into this document is decidable.
    expect(diagnostics).toHaveLength(0);
  });

  it("reports no local $ref for a nested one", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("application/schema+json;version=draft-07", #{ properties: #{ order: #{ \`$ref\`: "#/components/schemas/Other" } } })
      model OrderCreated {}
    `);

    // A nested reference is written in the schema language itself, and the
    // emitter does not read that language. Only the top level is decidable.
    expect(diagnostics).toHaveLength(0);
  });

  it("warns about a format outside the listed values, and still emits it", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("application/vnd.example.custom;version=1", #{ type: "record" })
      model OrderCreated {}
    `);

    const reported = findDiagnostic(diagnostics, "unknown-schema-format");
    expect(reported.severity).toBe("warning");
    expect(reported.message).toContain("application/vnd.example.custom;version=1");
    // The rule the emitter cannot check travels with the warning.
    expect(reported.message).toContain("must not be one of the listed identifiers");
    // The squiggle sits on the format argument, not on the model.
    expect(targetText(reported)).toBe(`"application/vnd.example.custom;version=1"`);

    // The spec allows a custom value, so the value still reaches the document.
    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    expect(doc.components?.messages?.OrderCreated.payload).toEqual({
      schemaFormat: "application/vnd.example.custom;version=1",
      schema: { type: "record" },
    });
  });

  it("warns about a listed format written without its version", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("application/vnd.apache.avro", #{ type: "record" })
      model OrderCreated {}
    `);

    const reported = findDiagnostic(diagnostics, "unknown-schema-format");
    expect(reported.severity).toBe("warning");
  });

  it("reports an empty schemaFormat, and falls back to the model payload", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("", #{ type: "record" })
      model OrderCreated {
        orderId: string;
      }
    `);

    const reported = findDiagnostic(diagnostics, "empty-schema-format");
    expect(reported.severity).toBe("error");

    // Nothing was recorded, so the message keeps the payload built from the
    // model.
    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    expect(doc.components?.messages?.OrderCreated.payload).toEqual({
      $ref: "#/components/schemas/OrderCreated",
    });
  });

  it("reports a schemaFormat of whitespace only", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawHeaders("   ", #{ type: "record" })
      model OrderCreated {
        orderId: string;
      }
    `);

    const reported = findDiagnostic(diagnostics, "empty-schema-format");
    expect(reported.severity).toBe("error");

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    expect(Object.hasOwn(doc.components?.messages?.OrderCreated ?? {}, "headers")).toBe(false);
  });

  it("accepts a listed format written with surrounding spaces, and trims it", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("  ${AVRO}  ", #{ type: "record" })
      model OrderCreated {}
    `);

    // The blank check already trims, so the same value decides membership and
    // reaches the document. The padding is not part of the identifier.
    expect(diagnostics).toHaveLength(0);
    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    expect(doc.components?.messages?.OrderCreated.payload).toEqual({
      schemaFormat: AVRO,
      schema: { type: "record" },
    });
  });

  it("reports a null schema, and falls back to the model payload", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${AVRO}", null)
      model OrderCreated {
        orderId: string;
      }
    `);

    // The spec requires the schema field, and the value must match the
    // format. A null is no Avro schema. So it takes the route of a value the
    // serializer cannot represent.
    const reported = findDiagnostic(diagnostics, "invalid-raw-schema");
    expect(reported.severity).toBe("error");

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    expect(doc.components?.messages?.OrderCreated.payload).toEqual({
      $ref: "#/components/schemas/OrderCreated",
    });
  });

  it("reports a null headers schema, and emits no headers", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawHeaders("${AVRO}", null)
      model OrderCreated {
        orderId: string;
      }
    `);

    expect(findDiagnostic(diagnostics, "invalid-raw-schema").severity).toBe("error");

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    expect(Object.hasOwn(doc.components?.messages?.OrderCreated ?? {}, "headers")).toBe(false);
  });

  it("reports a schema the serializer cannot represent, and falls back", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      scalar ipv4 extends string {
        init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
      }

      @message
      @rawPayload("${AVRO}", ipv4.fromBytes(1, 2, 3, 4))
      model OrderCreated {
        orderId: string;
      }
    `);

    const reported = findDiagnostic(diagnostics, "invalid-raw-schema");
    expect(reported.severity).toBe("error");
    // The squiggle sits on the schema argument, not on the format.
    expect(targetText(reported)).toBe("ipv4.fromBytes(1, 2, 3, 4)");

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    expect(doc.components?.messages?.OrderCreated.payload).toEqual({
      $ref: "#/components/schemas/OrderCreated",
    });
  });

  it("blocks a later application even when the first value was rejected", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${AVRO}", #{ name: "second" })
      @rawPayload("", #{ name: "first" })
      model OrderCreated {
        orderId: string;
      }
    `);

    // The guard records that the decorator ran before the value is checked.
    // So the author is told about both mistakes.
    expect(diagnosticsWith(diagnostics, "empty-schema-format")).toHaveLength(1);
    expect(diagnosticsWith(diagnostics, "duplicate-raw-payload-decorator")).toHaveLength(1);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    expect(doc.components?.messages?.OrderCreated.payload).toEqual({
      $ref: "#/components/schemas/OrderCreated",
    });
  });

  it("converts a scalar value inside the schema to its JSON form", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @rawPayload("${AVRO}", #{ type: "record", since: utcDateTime.fromISO("2026-08-15T09:30:00Z") })
      model OrderCreated {}
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.components?.messages?.OrderCreated.payload).toEqual({
      schemaFormat: AVRO,
      schema: { type: "record", since: "2026-08-15T09:30:00Z" },
    });
  });
});
