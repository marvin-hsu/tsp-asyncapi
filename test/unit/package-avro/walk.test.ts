import { describe, it, expect } from "vitest";
import {
  acceptSchema,
  compileAvro,
  emitAvro,
  emitAvroFiles,
  expectInstanceRoundTrip,
  expectValueRoundTrip,
  fieldNamed,
  recordFields,
} from "../../utils/avro.js";
import { scalarTableFor } from "#avro/walk/scalars.js";

/**
 * The walk, judged by the reference Avro implementation and by shape.
 *
 * One source drives most of this file. It holds every construct this phase
 * supports, and a nested record used twice, which is what the self contained
 * closure rule is about.
 */
const ORDERS = `
  @Avro.avroNamespace("com.example.orders")
  namespace Orders {
    /** What the money is counted in. */
    enum Currency {
      USD,
      EUR,
    }

    /** Where an order goes. */
    model Address {
      street: string;
      city: string;
    }

    model Money {
      amount: int64;
      currency: Currency;
    }

    /** An order left the checkout. */
    @Avro.avroRecord
    model OrderPlaced {
      id: string;
      shipping: Address;
      billing: Address;
      total: Money;
      tags: string[];
      labels: Record<string>;
    }
  }
`;

const ORDER_FILE = "com/example/orders/OrderPlaced.avsc";

describe("the scalar table", () => {
  it("builds one table per program", async () => {
    // The walk is entered once per @record, and resolving the seven type
    // references answers the same table every time inside one program. A
    // program that declares fifty records resolved them fifty times over.
    const program = await compileAvro(`
      @Avro.avroNamespace("com.example.a")
      namespace A {
        @Avro.avroRecord model One { a: string; }
        @Avro.avroRecord model Two { b: string; }
      }
    `);

    expect(scalarTableFor(program)).toBe(scalarTableFor(program));
  });
});

describe("the Avro walk", () => {
  it("writes a schema avsc accepts", async () => {
    const files = await emitAvroFiles(ORDERS);

    expect(Object.keys(files)).toEqual([ORDER_FILE]);

    const type = acceptSchema(files[ORDER_FILE]);
    expect(type.name).toBe("com.example.orders.OrderPlaced");
  });

  it("round-trips a random instance of the schema through a buffer", async () => {
    const files = await emitAvroFiles(ORDERS);

    expectInstanceRoundTrip(files[ORDER_FILE]);
  });

  it("inlines a nested record once and refers to it by name after that", async () => {
    const files = await emitAvroFiles(ORDERS);
    const schema = files[ORDER_FILE];

    // `shipping` is where Address first appears, so it carries the whole
    // definition. `billing` is the second appearance, so it is the name and
    // nothing else. Avro has no import, and a name may be defined once in a
    // schema, so the second copy would make the file illegal.
    expect(fieldNamed(schema, "shipping").type).toMatchObject({
      type: "record",
      name: "Address",
      namespace: "com.example.orders",
      doc: "Where an order goes.",
    });
    expect(fieldNamed(schema, "billing").type).toBe("com.example.orders.Address");
  });

  it("writes the file under the namespace as a directory path", async () => {
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.deep.nested")
      namespace Deep {
        @Avro.avroRecord model Event { id: string; }
      }
    `);

    expect(Object.keys(files)).toEqual(["com/example/deep/nested/Event.avsc"]);
    expectInstanceRoundTrip(files["com/example/deep/nested/Event.avsc"]);
  });

  it("takes the namespace from the nearest ancestor that declares one", async () => {
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.outer")
      namespace Outer {
        @Avro.avroNamespace("com.example.inner")
        namespace Inner {
          @Avro.avroRecord model Event { id: string; }
        }
        @Avro.avroRecord model Outside { id: string; }
      }
    `);

    expect(Object.keys(files).sort((a, b) => a.localeCompare(b))).toEqual([
      "com/example/inner/Event.avsc",
      "com/example/outer/Outside.avsc",
    ]);
    expectInstanceRoundTrip(files["com/example/inner/Event.avsc"]);
    expectInstanceRoundTrip(files["com/example/outer/Outside.avsc"]);
  });

  it("carries the doc comment of a record and of a field", async () => {
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.docs")
      namespace Docs {
        /** An order left the checkout. */
        @Avro.avroRecord model OrderPlaced {
          /** What the shop calls this order. */
          id: string;
        }
      }
    `);

    expect(files["com/example/docs/OrderPlaced.avsc"]).toMatchObject({
      doc: "An order left the checkout.",
    });
    expect(fieldNamed(files["com/example/docs/OrderPlaced.avsc"], "id").doc).toBe(
      "What the shop calls this order.",
    );
    expectInstanceRoundTrip(files["com/example/docs/OrderPlaced.avsc"]);
  });

  it("writes an array, a map and an enum in their Avro forms", async () => {
    const files = await emitAvroFiles(ORDERS);
    const schema = files[ORDER_FILE];

    expect(fieldNamed(schema, "tags").type).toEqual({ type: "array", items: "string" });
    expect(fieldNamed(schema, "labels").type).toEqual({ type: "map", values: "string" });

    const money = fieldNamed(schema, "total").type;
    expect(fieldNamed(money, "currency").type).toEqual({
      type: "enum",
      name: "Currency",
      namespace: "com.example.orders",
      doc: "What the money is counted in.",
      symbols: ["USD", "EUR"],
    });
  });

  it("refers to an enum by name after its first appearance", async () => {
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.orders")
      namespace Orders {
        enum Currency { USD, EUR }
        @Avro.avroRecord model Prices {
          asked: Currency;
          paid: Currency;
        }
      }
    `);
    const schema = files["com/example/orders/Prices.avsc"];

    expect(fieldNamed(schema, "asked").type).toMatchObject({ type: "enum", name: "Currency" });
    expect(fieldNamed(schema, "paid").type).toBe("com.example.orders.Currency");
    expectInstanceRoundTrip(schema);
  });

  it("writes a type that reaches itself as a name", async () => {
    // Recursion needs no rule of its own. The name is remembered before the
    // fields are walked, so the field that reaches back finds it there.
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.tree")
      namespace Tree {
        @Avro.avroRecord model Node {
          value: string;
          children: Node[];
        }
      }
    `);
    const schema = files["com/example/tree/Node.avsc"];

    expect(fieldNamed(schema, "children").type).toEqual({
      type: "array",
      items: "com.example.tree.Node",
    });
    expectValueRoundTrip(schema, {
      value: "root",
      children: [{ value: "leaf", children: [] }],
    });
  });

  it("writes a type that reaches itself through an optional field", async () => {
    // The union with null is what lets an instance stop. Avro says recursion
    // by name, so the schema needs no rule for it either way.
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.tree")
      namespace Tree {
        @Avro.avroRecord model Node {
          value: string;
          next?: Node;
        }
      }
    `);
    const schema = files["com/example/tree/Node.avsc"];

    expect(fieldNamed(schema, "next").type).toEqual(["null", "com.example.tree.Node"]);
    expectValueRoundTrip(schema, { value: "head", next: { value: "tail", next: null } });
  });

  it("writes two types that reach each other", async () => {
    // Neither name is written twice. Branch is defined where it first
    // appears, Leaf inside it, and the field that reaches back to Branch
    // finds the name already claimed.
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.tree")
      namespace Tree {
        model Branch { leaf: Leaf; }
        model Leaf { up?: Branch; }
        @Avro.avroRecord model Plant { root: Branch; }
      }
    `);
    const schema = files["com/example/tree/Plant.avsc"];

    const branch = fieldNamed(schema, "root").type;
    expect(branch).toMatchObject({ type: "record", name: "Branch" });
    const leaf = fieldNamed(branch, "leaf").type;
    expect(leaf).toMatchObject({ type: "record", name: "Leaf" });
    expect(fieldNamed(leaf, "up").type).toEqual(["null", "com.example.tree.Branch"]);

    expectValueRoundTrip(schema, {
      root: { leaf: { up: { leaf: { up: null } } } },
    });
  });

  it("maps each supported scalar to its Avro primitive", async () => {
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.scalars")
      namespace Scalars {
        @Avro.avroRecord model Every {
          flag: boolean;
          text: string;
          blob: bytes;
          small: int32;
          big: int64;
          single: float32;
          twice: float64;
        }
      }
    `);
    const schema = files["com/example/scalars/Every.avsc"];

    expect(recordFields(schema).map((field) => [field.name, field.type])).toEqual([
      ["flag", "boolean"],
      ["text", "string"],
      ["blob", "bytes"],
      ["small", "int"],
      ["big", "long"],
      ["single", "float"],
      ["twice", "double"],
    ]);
    expectInstanceRoundTrip(schema);
  });

  it("maps a scalar the author declared through the scalar it extends", async () => {
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.scalars")
      namespace Scalars {
        scalar Age extends int32;
        @Avro.avroRecord model Person { age: Age; }
      }
    `);

    expect(fieldNamed(files["com/example/scalars/Person.avsc"], "age").type).toBe("int");
    expectInstanceRoundTrip(files["com/example/scalars/Person.avsc"]);
  });

  it("writes the keys in one order, whichever schema they belong to", async () => {
    const files = await emitAvroFiles(ORDERS);
    const schema = files[ORDER_FILE];

    // The order is the one the Avro specification lists: the type, then the
    // name, then the rest. Two runs of the emitter have to write the same
    // bytes, and the key order is the only thing that could differ. The key
    // list of each object is read on its own, because a position inside the
    // whole document says nothing about the object that holds it.
    expect(Object.keys(schema as object)).toEqual(["type", "name", "namespace", "doc", "fields"]);

    const nested = fieldNamed(schema, "shipping").type;
    expect(Object.keys(nested as object)).toEqual(["type", "name", "namespace", "doc", "fields"]);

    const currency = fieldNamed(fieldNamed(schema, "total").type, "currency").type;
    expect(Object.keys(currency as object)).toEqual([
      "type",
      "name",
      "namespace",
      "doc",
      "symbols",
    ]);
  });

  it("writes the file as two-space indented JSON that ends in a newline", async () => {
    const result = await emitAvro(`
      @Avro.avroNamespace("com.example.plain")
      namespace Plain {
        @Avro.avroRecord model Event { id: string; }
      }
    `);

    // The bytes, not the parsed value. Indentation and the closing newline
    // survive no other assertion in this file, and both are what makes the
    // output readable in a diff.
    expect(result.texts["com/example/plain/Event.avsc"]).toBe(
      `{
  "type": "record",
  "name": "Event",
  "namespace": "com.example.plain",
  "fields": [
    {
      "name": "id",
      "type": "string"
    }
  ]
}
`,
    );
  });

  it("leaves out a doc nobody wrote", async () => {
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.plain")
      namespace Plain {
        @Avro.avroRecord model Event { id: string; }
      }
    `);

    expect(files["com/example/plain/Event.avsc"]).toEqual({
      type: "record",
      name: "Event",
      namespace: "com.example.plain",
      fields: [{ name: "id", type: "string" }],
    });
    expectInstanceRoundTrip(files["com/example/plain/Event.avsc"]);
  });

  it("lets a record take the name of a complex Avro type", async () => {
    // Avro keeps the eight primitive names alone. A complex type is spelled
    // by an object with a `type` field, so a record named `map` is not a name
    // a reference can land on by mistake. `emitAvroFiles` runs the file past
    // the reference implementation, which is the proof this is legal.
    const files = await emitAvroFiles(`
      @Avro.avroNamespace("com.example.complex")
      namespace Complex {
        @Avro.avroRecord model map { values: Record<string>; }
      }
    `);

    expect(files["com/example/complex/map.avsc"]).toEqual({
      type: "record",
      name: "map",
      namespace: "com.example.complex",
      fields: [{ name: "values", type: { type: "map", values: "string" } }],
    });
    expectInstanceRoundTrip(files["com/example/complex/map.avsc"]);
  });
});
