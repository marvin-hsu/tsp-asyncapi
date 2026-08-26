/**
 * What a `@header` property does to a generated Avro payload.
 *
 * A header travels beside the payload, so the payload must not carry it. The
 * document already leaves a lifted field out of a JSON Schema payload, and a
 * generated one has to answer the same way. A payload that described the
 * field would describe it twice, once beside the message and once inside it.
 *
 * The `.avsc` file leaves it out too. `tsp-avro` reads the mark itself, so one
 * walk answers for both, and the file and the payload cannot disagree. That
 * half is tested beside the walk; here the document is what matters.
 *
 * Everything below runs the whole emitter and reads the file it wrote.
 */

import { describe, expect, it } from "vitest";
import { createTester } from "@typespec/compiler/testing";
import { fileURLToPath } from "node:url";
import { PACKAGE_NAME } from "#emitter/lib.js";
import type { AsyncAPIDocument } from "#emitter/types/index.js";
import yaml from "yaml";

const PACKAGE_ROOT = fileURLToPath(
  new URL("../../../../../packages/tsp-asyncapi", import.meta.url),
);

const OUTPUT_FILE = "asyncapi.yaml";

const AvroEmitTester = createTester(PACKAGE_ROOT, {
  libraries: [PACKAGE_NAME, "tsp-avro"],
})
  .importLibraries()
  .using("AsyncAPI")
  .emit(PACKAGE_NAME, { "preview-features": ["avro"] });

/** One message whose trace id is a header and whose order id is not. */
const LIFTED = `
  @service(#{ title: "Orders" })
  namespace Test;

  @Avro.avroNamespace("com.example.orders")
  namespace Test.Orders {
    @message
    @Avro.avroRecord
    model OrderPlaced {
      @header traceId: string;
      orderId: string;
    }
  }

  @channel("orders")
  interface C {
    @send
    op place(event: Test.Orders.OrderPlaced): void;
  }
`;

/** What one compilation produced. */
interface Emitted {
  readonly doc: AsyncAPIDocument;
}

/**
 * Compiles one source with the feature on and parses the document.
 *
 * @param code - The TypeSpec source of the case
 * @returns The document the emitter wrote
 */
async function emit(code: string): Promise<Emitted> {
  const [result, diagnostics] = await AvroEmitTester.compileAndDiagnose(code);
  expect(diagnostics.filter((one) => one.severity === "error")).toStrictEqual([]);

  const outputs: Record<string, string | undefined> = result.outputs;
  const content = outputs[OUTPUT_FILE];
  if (content === undefined) throw new Error("The emitter wrote no document.");
  return { doc: yaml.parse(content) as AsyncAPIDocument };
}

/** The field names of the Avro record one message carries as its payload. */
function fieldNamesOf(doc: AsyncAPIDocument, name: string): string[] {
  const payload = doc.components?.messages?.[name].payload as {
    schema: { fields: { name: string }[] };
  };
  return payload.schema.fields.map((field) => field.name);
}

describe("Unit: a header of a message with a generated Avro payload", () => {
  it("leaves the lifted field out of the record", async () => {
    const { doc } = await emit(LIFTED);

    expect(fieldNamesOf(doc, "OrderPlaced")).toStrictEqual(["orderId"]);
  });

  /** The field has to be somewhere, and beside the payload is where. */
  it("describes the lifted field in the headers", async () => {
    const { doc } = await emit(LIFTED);
    const headers = doc.components?.messages?.OrderPlaced.headers as {
      properties?: Record<string, unknown>;
    };

    expect(Object.keys(headers.properties ?? {})).toStrictEqual(["traceId"]);
  });

  /**
   * `@headers` points at a model of its own, so nothing leaves the payload
   * and the two descriptions already agree.
   */
  it("stays quiet when the headers are a model of their own", async () => {
    const withModel = `
      @service(#{ title: "Orders" })
      namespace Test;

      @Avro.avroNamespace("com.example.orders")
      namespace Test.Orders {
        model Meta {
          traceId: string;
        }

        @message
        @headers(Meta)
        @Avro.avroRecord
        model OrderPlaced {
          orderId: string;
        }
      }

      @channel("orders")
      interface C {
        @send
        op place(event: Test.Orders.OrderPlaced): void;
      }
    `;
    const { doc } = await emit(withModel);

    expect(fieldNamesOf(doc, "OrderPlaced")).toStrictEqual(["orderId"]);
  });
});
