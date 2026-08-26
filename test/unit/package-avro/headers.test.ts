/**
 * What `@AsyncAPI.header` does to an Avro record.
 *
 * Avro has no notion of a message header. AsyncAPI does: a marked property
 * travels beside the message rather than inside it. A record that declared
 * such a property would describe a field the message does not carry there, so
 * the walk leaves it out and says so.
 *
 * The walk reads the mark through the global symbol registry, without a
 * dependency on the AsyncAPI package. So these cases load both libraries, and
 * they run from the emitter package, which is where both resolve from.
 *
 * Nothing is reported. The record without the header is the record the author
 * asked for. A project that wants the list turns on the AsyncAPI linter rule
 * `avro-record-drops-header`, which is tested beside the other rules.
 *
 * One walk answers for the `.avsc` file and for a generated AsyncAPI payload,
 * which is why the two cannot describe different fields.
 */

import { describe, expect, it } from "vitest";
import { createTester } from "@typespec/compiler/testing";
import { fileURLToPath } from "node:url";
import type { Model, Program } from "@typespec/compiler";
import { buildAvroRecordWithDiagnostics } from "#avro/unstable.js";
import { listRecords } from "#avro/index.js";

const PACKAGE_ROOT = fileURLToPath(new URL("../../../packages/tsp-asyncapi", import.meta.url));

/** Both libraries, and no emitter. The decorators write their state and stop. */
const BothTester = createTester(PACKAGE_ROOT, {
  libraries: ["tsp-asyncapi", "tsp-avro"],
})
  .importLibraries()
  .using("AsyncAPI");

/** What one walk produced. */
interface Walked {
  /** The field names of the record, or null when the walk refused it. */
  readonly fields: string[] | null;
  /** The code of every diagnostic the walk collected. */
  readonly codes: string[];
  /** The record itself, for a case that reads deeper than the field names. */
  readonly record: unknown;
}

/**
 * Compiles one source and walks the record it names.
 *
 * @param source - The TypeSpec source of the case
 * @param name - The record to walk
 * @returns The field names, the diagnostic codes, and the record
 */
async function walk(source: string, name: string): Promise<Walked> {
  const runner = await BothTester.createInstance();
  const [, diagnostics] = await runner.compileAndDiagnose(source);
  expect(diagnostics.filter((one) => one.severity === "error")).toStrictEqual([]);

  const program: Program = runner.program;
  const model = listRecords(program).find((one: Model) => one.name === name);
  if (model === undefined) throw new Error(`No @Avro.avroRecord model named '${name}'.`);

  const [record, collected] = buildAvroRecordWithDiagnostics(program, model);
  return {
    fields: record === undefined ? null : record.fields.map((field) => field.name),
    codes: collected.map((one) => one.code),
    record,
  };
}

const LIFTED = `
  @Avro.avroNamespace("com.example.orders")
  namespace Orders {
    @message
    @Avro.avroRecord
    model OrderPlaced {
      @header traceId: string;
      orderId: string;
    }
  }
`;

describe("Unit: a header property of an Avro record", () => {
  it("leaves the marked property out of the record", async () => {
    const { fields } = await walk(LIFTED, "OrderPlaced");

    expect(fields).toStrictEqual(["orderId"]);
  });

  /** Dropping the property is the right answer, so there is nothing to say. */
  it("reports nothing", async () => {
    const { codes } = await walk(LIFTED, "OrderPlaced");

    expect(codes).toStrictEqual([]);
  });

  /**
   * The warning must not stop the file. The record without the header is the
   * correct record, so there is nothing to refuse.
   */
  it("still builds the record", async () => {
    const { record } = await walk(LIFTED, "OrderPlaced");

    expect(record).not.toBeUndefined();
  });

  /**
   * `@header` means something on a field of a message. A model reached from
   * one is not a message, so a mark there means nothing and the property
   * stays. The AsyncAPI emitter reports that mark and keeps the property too,
   * so dropping it here would take the field out of the document entirely.
   */
  it("keeps a marked property of a nested model", async () => {
    const nested = `
      @Avro.avroNamespace("com.example.orders")
      namespace Orders {
        model Detail {
          @header note: string;
          amount: int64;
        }

        @message
        @Avro.avroRecord
        model OrderPlaced {
          orderId: string;
          detail: Detail;
        }
      }
    `;
    const { record, codes } = await walk(nested, "OrderPlaced");
    const built = record as { fields: { name: string; type: { fields: { name: string }[] } }[] };
    const detail = built.fields.find((field) => field.name === "detail");

    expect(detail?.type.fields.map((field) => field.name)).toStrictEqual(["note", "amount"]);
    expect(codes).toStrictEqual([]);
  });

  /** A project with no AsyncAPI decorator at all reads nothing and drops nothing. */
  it("drops nothing when no property is marked", async () => {
    const plain = LIFTED.replace("@header traceId: string;", "traceId: string;");
    const { fields, codes } = await walk(plain, "OrderPlaced");

    expect(fields).toStrictEqual(["traceId", "orderId"]);
    expect(codes).toStrictEqual([]);
  });
});
