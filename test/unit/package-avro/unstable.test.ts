/**
 * The unstable entry point: what another package calls, and what it gets.
 *
 * Two promises are made here, and both are about a caller outside this
 * package.
 *
 * The first is that the walk can be driven without a word reaching the
 * program. A user who asked for one emitter should not read the diagnostic
 * codes of another, and two emitters over one program must not report a
 * refusal twice. So the reason is handed back rather than reported, and the
 * caller says it under its own name.
 *
 * The second is that the rendered value is a JSON value, ready to sit inside
 * another document. A member the author declared none of is absent, not
 * undefined: a YAML writer keeps an undefined member and writes it as null,
 * which states something the author never wrote.
 */

import { describe, it, expect } from "vitest";
import type { Model, Program } from "@typespec/compiler";
import type { AvroRecord } from "#avro/types.js";
import { AvroTester } from "#avro/testing.js";
import { listRecords } from "#avro/decorators/record.js";
import { buildAvroRecord } from "#avro/walk/model.js";
import { renderAvroFile } from "#avro/render.js";
import { buildAvroRecordWithDiagnostics, renderAvroSchema } from "#avro/unstable.js";

/**
 * Compiles a source and hands back the program with its one marked model.
 *
 * The compile has to be clean, so anything the program holds afterwards came
 * from the call under test.
 *
 * @param source - The TypeSpec source
 * @returns The program and the model marked with `@record`
 */
async function compileOneRecord(source: string): Promise<{ program: Program; model: Model }> {
  const runner = await AvroTester.createInstance();
  await runner.diagnose(source);
  const program = runner.program;
  expect(program.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([]);

  const records = listRecords(program);
  expect(records).toHaveLength(1);
  return { program, model: records[0] };
}

/**
 * A record the walk refuses. Avro has no inheritance, so the inherited field
 * would be lost, and the walk refuses rather than lose it.
 */
const REFUSED = `
  @Avro.\`namespace\`("com.example.orders")
  namespace Orders {
    model Base { at: utcDateTime; }
    @Avro.\`record\` model OrderPlaced extends Base { id: string; }
  }
`;

/**
 * A record the walk accepts, and one with no documentation on it.
 */
const ACCEPTED = `
  @Avro.\`namespace\`("com.example.orders")
  namespace Orders {
    @Avro.\`record\` model OrderPlaced { id: string; note?: string; }
  }
`;

/**
 * Builds the accepted record the rendering tests read.
 *
 * A refusal here is a broken test source rather than a failed assertion, so
 * it throws where it happened.
 *
 * @returns The record
 */
async function acceptedRecord(): Promise<AvroRecord> {
  const { program, model } = await compileOneRecord(ACCEPTED);
  const [schema] = buildAvroRecordWithDiagnostics(program, model);
  if (schema === undefined) {
    throw new Error("The walk refused the record these tests are built on.");
  }
  return schema;
}

/**
 * Asserts that nothing anywhere inside a rendered value is undefined.
 *
 * @param value - A rendered schema, or any part of one
 * @param path - Where the value sits, for the failure message
 */
function expectNoUndefined(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      expectNoUndefined(item, `${path}[${String(index)}]`);
    });
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  for (const [key, member] of Object.entries(value)) {
    expect(member, `${path}.${key} is undefined`).toBeDefined();
    expectNoUndefined(member, `${path}.${key}`);
  }
}

describe("the collecting variant of the walk", () => {
  it("hands back the refusal and reports nothing", async () => {
    const { program, model } = await compileOneRecord(REFUSED);

    const [schema, collected] = buildAvroRecordWithDiagnostics(program, model);

    expect(schema).toBeUndefined();
    expect(collected.map((diagnostic) => diagnostic.code)).toEqual(["tsp-avro/unsupported-type"]);
    expect(program.diagnostics).toEqual([]);
  });

  it("collects what the reporting variant reports", async () => {
    const { program, model } = await compileOneRecord(REFUSED);

    const [, collected] = buildAvroRecordWithDiagnostics(program, model);
    expect(program.diagnostics).toEqual([]);

    // The same walk again, this time through the variant this package's own
    // emitter calls. What it puts on the program is what the other one
    // handed back, so the two paths refuse for one reason and say it once.
    expect(buildAvroRecord(program, model)).toBeUndefined();
    expect(program.diagnostics).toEqual(collected);
  });

  it("hands back the schema and reports nothing when it accepts", async () => {
    const { program, model } = await compileOneRecord(ACCEPTED);

    const [schema, collected] = buildAvroRecordWithDiagnostics(program, model);

    expect(schema?.name).toBe("OrderPlaced");
    expect(collected).toEqual([]);
    expect(program.diagnostics).toEqual([]);
  });
});

describe("the rendered schema an embedding caller gets", () => {
  it("holds no undefined member", async () => {
    const rendered = renderAvroSchema(await acceptedRecord());

    // Nothing declared documentation, so no `doc` member is written at all.
    expect(rendered).not.toHaveProperty("doc");
    expectNoUndefined(rendered, "schema");
  });

  it("is what the file is written from", async () => {
    const record = await acceptedRecord();

    // The file is the rendered value and nothing else, so promoting the
    // renderer cannot move a byte of an `.avsc` file.
    expect(renderAvroFile(record)).toBe(
      `${JSON.stringify(renderAvroSchema(record), undefined, 2)}\n`,
    );
  });
});
