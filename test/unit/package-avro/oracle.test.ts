import { describe, it, expect } from "vitest";
import avro from "avsc";

/**
 * The oracle, reachable from the test tree.
 *
 * `avsc` is the reference Avro implementation, and it is what proves a schema
 * this package writes is legal and usable. The tests that use it live here, at
 * the repository root, so the dependency has to resolve from here. A copy that
 * only resolves inside `packages/tsp-avro` is unreachable from this file.
 *
 * These two tests are the two layers every later Avro test builds on.
 */
describe("the avsc oracle", () => {
  it("accepts a record schema", () => {
    const type = avro.Type.forSchema({
      type: "record",
      name: "OrderPlaced",
      namespace: "com.example.orders",
      fields: [{ name: "id", type: "string" }],
    });

    expect(type.name).toBe("com.example.orders.OrderPlaced");
  });

  it("round-trips an instance through a buffer", () => {
    const type = avro.Type.forSchema({
      type: "record",
      name: "OrderPlaced",
      fields: [
        { name: "id", type: "string" },
        { name: "quantity", type: "int" },
      ],
    });

    const value = { id: "order-1", quantity: 3 };

    expect(type.fromBuffer(type.toBuffer(value))).toEqual(value);
  });
});
