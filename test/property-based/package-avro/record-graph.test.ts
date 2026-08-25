import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { emitAvro, expectInstanceRoundTrip, expectValueRoundTrip } from "../../utils/avro.js";

/**
 * Properties of a graph of records, driven through `avsc`.
 *
 * One Avro schema file holds every named type the record reaches, because
 * Avro has no import. So the interesting question is not what one record
 * looks like: it is whether a file the walk assembled out of many
 * declarations is still a schema a reader can use. `avsc` answers that, and
 * it answers it twice. It builds a type from the file, and it encodes and
 * decodes an instance of that type.
 *
 * The generator draws a directed acyclic graph. Record `Mi` may hold a field
 * of `Mj` only where `j` is smaller, so a drawn program never reaches itself.
 * That is a limit of the oracle rather than of the emitter: `random` walks a
 * plain field that reaches back until the stack runs out, so a cycle has no
 * random instance to try.
 *
 * The shapes a random draw reaches rarely are pinned by hand below instead.
 * Recursion, mutual recursion, a node two records share, and an optional
 * field each have a written source and a written instance. A counter over
 * random draws would fire on a run and not on the next one, and a test that
 * depends on the seed proves nothing about the code.
 */

/** The Avro namespace every generated program declares. */
const NAMESPACE = "com.example.generated";

/** The primitive types a generated field may hold. */
const PRIMITIVES = ["string", "int32", "int64", "float64", "boolean", "bytes"] as const;

/** One field of a generated record. */
interface FieldDecl {
  /** The type expression, before optionality is applied. */
  readonly type: string;
  /** Whether the field is optional. */
  readonly optional: boolean;
  /** The default the field declares, as source text, or none. */
  readonly initializer: string | undefined;
}

/** One record of a generated program. */
interface RecordDecl {
  readonly fields: readonly FieldDecl[];
}

/**
 * The type expressions record `index` may hold.
 *
 * A reference to an earlier record keeps the graph acyclic. The enum is
 * always declared, so it is always available.
 */
function typesFor(index: number): fc.Arbitrary<string> {
  const bases = [
    ...PRIMITIVES,
    "Status",
    ...Array.from({ length: index }, (_, i) => `M${String(i)}`),
  ];
  const base = fc.constantFrom(...bases);
  return fc.oneof(
    { weight: 3, arbitrary: base },
    { weight: 1, arbitrary: base.map((type) => `${type}[]`) },
    { weight: 1, arbitrary: base.map((type) => `Record<${type}>`) },
  );
}

/** One field of record `index`. */
function fieldFor(index: number): fc.Arbitrary<FieldDecl> {
  return fc.record({
    type: typesFor(index),
    optional: fc.boolean(),
    initializer: fc.constant(undefined),
  });
}

/**
 * A graph of two to four records.
 *
 * `fc.tuple` is built one element at a time, because what a record may hold
 * depends on how many records come before it.
 */
const recordGraph: fc.Arbitrary<readonly RecordDecl[]> = fc
  .integer({ min: 2, max: 4 })
  .chain((count) =>
    fc.tuple(
      ...Array.from({ length: count }, (_, index) =>
        fc.record<RecordDecl>({
          fields: fc.array(fieldFor(index), { minLength: 0, maxLength: 4 }),
        }),
      ),
    ),
  );

/** Writes one field as TypeSpec source. */
function renderField(field: FieldDecl, index: number): string {
  const mark = field.optional ? "?" : "";
  const initializer = field.initializer === undefined ? "" : ` = ${field.initializer}`;
  return `  f${String(index)}${mark}: ${field.type}${initializer};`;
}

/** Writes a drawn graph as TypeSpec source. */
function renderGraph(records: readonly RecordDecl[]): string {
  const declarations = records.map((record, index) => {
    const fields = record.fields.map(renderField).join("\n");
    return `@Avro.\`record\`\nmodel M${String(index)} {\n${fields}\n}`;
  });
  return [
    `@Avro.\`namespace\`("${NAMESPACE}")`,
    "namespace Generated;",
    "enum Status {\n  Unknown,\n  Ready,\n}",
    ...declarations,
  ].join("\n\n");
}

/**
 * Compiles a source, then asserts every file it wrote is a usable schema.
 *
 * The generated names are unique by construction, and every type in the pool
 * has an Avro form. So a diagnostic here is a defect, and the assertion says
 * so before the schemas are read.
 */
async function expectGraphRoundTrips(source: string, fileCount: number): Promise<void> {
  const result = await emitAvro(source);
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([]);
  expect(Object.keys(result.files)).toHaveLength(fileCount);

  for (const schema of Object.values(result.files)) {
    expectInstanceRoundTrip(schema, 3);
  }
}

describe("Property: Avro — a graph of records", () => {
  it("writes a usable schema for every record of an acyclic graph", async () => {
    await fc.assert(
      fc.asyncProperty(recordGraph, async (records) => {
        await expectGraphRoundTrips(renderGraph(records), records.length);
      }),
      { numRuns: 120, seed: 20260825 },
    );
  });

  /**
   * A record that reaches itself.
   *
   * The field is optional, so null ends the chain. A written instance names
   * the depth, which is what `random` cannot do: it would draw the branch
   * that recurses until the stack runs out.
   */
  it("round-trips a record that reaches itself", async () => {
    const result = await emitAvro(`
      @Avro.\`namespace\`("${NAMESPACE}")
      namespace Generated;

      @Avro.\`record\`
      model Node {
        label: string;
        next?: Node;
      }
    `);

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([]);
    expectValueRoundTrip(result.files["com/example/generated/Node.avsc"], {
      label: "head",
      next: { label: "tail", next: null },
    });
  });

  /** Two records that reach each other. */
  it("round-trips two records that reach each other", async () => {
    const result = await emitAvro(`
      @Avro.\`namespace\`("${NAMESPACE}")
      namespace Generated;

      @Avro.\`record\`
      model Parent {
        name: string;
        child?: Child;
      }

      model Child {
        name: string;
        parent?: Parent;
      }
    `);

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([]);
    expectValueRoundTrip(result.files["com/example/generated/Parent.avsc"], {
      name: "root",
      child: { name: "leaf", parent: null },
    });
  });

  /**
   * A node two records share.
   *
   * Each file holds a whole copy of it, because Avro has no import. So both
   * files stand on their own, and both are checked here.
   */
  it("writes a shared record into both of the files that reach it", async () => {
    const result = await emitAvro(`
      @Avro.\`namespace\`("${NAMESPACE}")
      namespace Generated;

      model Address {
        city: string;
      }

      @Avro.\`record\`
      model Sender {
        from: Address;
      }

      @Avro.\`record\`
      model Receiver {
        to: Address;
      }
    `);

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([]);
    const sender = result.files["com/example/generated/Sender.avsc"];
    const receiver = result.files["com/example/generated/Receiver.avsc"];

    expect(JSON.stringify(sender)).toContain('"name":"Address"');
    expect(JSON.stringify(receiver)).toContain('"name":"Address"');
    expectInstanceRoundTrip(sender);
    expectInstanceRoundTrip(receiver);
  });

  /** An optional field, and an optional field that carries a default. */
  it("round-trips both shapes an optional field takes", async () => {
    const result = await emitAvro(`
      @Avro.\`namespace\`("${NAMESPACE}")
      namespace Generated;

      @Avro.\`record\`
      model Shipment {
        absent?: string;
        defaulted?: string = "pending";
      }
    `);

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([]);
    const schema = result.files["com/example/generated/Shipment.avsc"];

    expectValueRoundTrip(schema, { absent: null, defaulted: "pending" });
    expectValueRoundTrip(schema, { absent: "here", defaulted: null });
    expectInstanceRoundTrip(schema);
  });
});
