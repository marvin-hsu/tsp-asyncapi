import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  emitAvro,
  expectInstanceRoundTrip,
  expectValueRoundTrip,
  fieldNamed,
} from "../../utils/avro.js";

/**
 * Properties of a graph of records, driven through `avsc`.
 *
 * One Avro file holds every named type a record reaches, because Avro has no
 * import. `avsc` builds a type from the file, then encodes and decodes an
 * instance of it, so both the type and an encoded value get checked.
 *
 * The generator draws a directed acyclic graph: record `Mi` may hold a field
 * of `Mj` only where `j` is smaller. `random` walks a plain field back until
 * the stack overflows, so a cycle has no random instance to try; that limit
 * belongs to the oracle, not the emitter. Recursion, mutual recursion, a node
 * two records share, and an optional field are each pinned by hand below.
 *
 * Counters track the shapes a draw produces and are asserted after the run.
 * A record with no fields is a legal draw that would still round-trip even
 * if the generator stopped producing cross-record references, arrays, or
 * maps, so the counters are what proves the run was about anything. The
 * seed is fixed, so the counts are the same on every run.
 */

const NAMESPACE = "com.example.generated";

const PRIMITIVES = ["string", "int32", "int64", "float64", "boolean", "bytes"] as const;

/**
 * The default each primitive can carry, as TypeSpec source.
 *
 * `bytes` is left out. Avro reads a default for `bytes` as a string of one
 * byte per character, and TypeSpec has no literal that says that. A record
 * reference and an enum are left out for the same kind of reason: neither has
 * a literal the generator can write without knowing what was drawn.
 */
const DEFAULTS: Readonly<Record<string, string>> = {
  string: '"a"',
  int32: "1",
  int64: "2",
  float64: "1.5",
  boolean: "true",
};

/** How a generated field wraps its base type. */
type Wrapper = "plain" | "array" | "map";

/** One field of a generated record. */
interface FieldDecl {
  readonly base: string;
  readonly wrapper: Wrapper;
  readonly optional: boolean;
  /** The default the field declares, as source text, or none. */
  readonly initializer: string | undefined;
}

interface RecordDecl {
  readonly fields: readonly FieldDecl[];
}

/**
 * The base types record `index` may hold.
 *
 * A reference to an earlier record keeps the graph acyclic. The enum is
 * always declared, so it is always available.
 */
function basesFor(index: number): fc.Arbitrary<string> {
  return fc.constantFrom(
    ...PRIMITIVES,
    "Status",
    ...Array.from({ length: index }, (_, i) => `M${String(i)}`),
  );
}

/** What a field wraps its base type in. A plain field is the common one. */
const WRAPPERS: fc.Arbitrary<Wrapper> = fc.oneof(
  { weight: 3, arbitrary: fc.constant<Wrapper>("plain") },
  { weight: 1, arbitrary: fc.constant<Wrapper>("array") },
  { weight: 1, arbitrary: fc.constant<Wrapper>("map") },
);

/**
 * One field of record `index`.
 *
 * A default is drawn only where one can be written: the field is plain, and
 * its base type has a literal. Everything else draws no default.
 */
function fieldFor(index: number): fc.Arbitrary<FieldDecl> {
  return fc
    .record({
      base: basesFor(index),
      wrapper: WRAPPERS,
      optional: fc.boolean(),
      defaulted: fc.boolean(),
    })
    .map(({ base, wrapper, optional, defaulted }) => ({
      base,
      wrapper,
      optional,
      initializer: wrapper === "plain" && defaulted ? DEFAULTS[base] : undefined,
    }));
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

/** How many draws reached each shape this property is about, tallied as a draw is rendered. */
const reached = { crossRecord: 0, array: 0, map: 0, optional: 0, defaulted: 0 };

function isRecordReference(base: string): boolean {
  return /^M\d+$/.test(base);
}

function renderType(field: FieldDecl): string {
  if (field.wrapper === "array") return `${field.base}[]`;
  if (field.wrapper === "map") return `Record<${field.base}>`;
  return field.base;
}

/** Writes one field as TypeSpec source, and counts the shapes it reaches. */
function renderField(field: FieldDecl, index: number): string {
  if (isRecordReference(field.base)) reached.crossRecord++;
  if (field.wrapper === "array") reached.array++;
  if (field.wrapper === "map") reached.map++;
  if (field.optional) reached.optional++;
  if (field.initializer !== undefined) reached.defaulted++;

  const mark = field.optional ? "?" : "";
  const initializer = field.initializer === undefined ? "" : ` = ${field.initializer}`;
  return `  f${String(index)}${mark}: ${renderType(field)}${initializer};`;
}

/** Writes a drawn graph as TypeSpec source. */
function renderGraph(records: readonly RecordDecl[]): string {
  const declarations = records.map((record, index) => {
    const fields = record.fields.map(renderField).join("\n");
    return `@Avro.avroRecord\nmodel M${String(index)} {\n${fields}\n}`;
  });
  return [
    `@Avro.avroNamespace("${NAMESPACE}")`,
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

    // The run has to be about something. Each floor is well under what the
    // fixed seed draws, so a floor that fails means the generator stopped
    // producing that shape, not that a draw came out unlucky.
    expect(reached.crossRecord).toBeGreaterThan(30);
    expect(reached.array).toBeGreaterThan(50);
    expect(reached.map).toBeGreaterThan(50);
    expect(reached.optional).toBeGreaterThan(150);
    expect(reached.defaulted).toBeGreaterThan(50);
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
      @Avro.avroNamespace("${NAMESPACE}")
      namespace Generated;

      @Avro.avroRecord
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
      @Avro.avroNamespace("${NAMESPACE}")
      namespace Generated;

      @Avro.avroRecord
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
      @Avro.avroNamespace("${NAMESPACE}")
      namespace Generated;

      model Address {
        city: string;
      }

      @Avro.avroRecord
      model Sender {
        from: Address;
      }

      @Avro.avroRecord
      model Receiver {
        to: Address;
      }
    `);

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([]);
    const sender = result.files["com/example/generated/Sender.avsc"];
    const receiver = result.files["com/example/generated/Receiver.avsc"];

    // A name on its own would satisfy a search for the text `Address`, and a
    // name is exactly what a file that failed to inline the definition would
    // hold. So the whole definition is the expected value.
    const address = {
      type: "record",
      name: "Address",
      namespace: NAMESPACE,
      fields: [{ name: "city", type: "string" }],
    };

    expect(fieldNamed(sender, "from").type).toEqual(address);
    expect(fieldNamed(receiver, "to").type).toEqual(address);
    expectInstanceRoundTrip(sender);
    expectInstanceRoundTrip(receiver);
  });

  /** An optional field, and an optional field that carries a default. */
  it("round-trips both shapes an optional field takes", async () => {
    const result = await emitAvro(`
      @Avro.avroNamespace("${NAMESPACE}")
      namespace Generated;

      @Avro.avroRecord
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
