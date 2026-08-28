import { describe, it, expect } from "vitest";
import { avroFullName, avroNamespaceOf } from "#avro/walk/full-names.js";

/**
 * The Avro full name rule, joined and split again.
 *
 * The two functions are one rule read in two directions. A test that splits
 * what the same module joined is what holds them together.
 */
describe("avro full names", () => {
  it("joins a namespace and a name", () => {
    expect(avroFullName("com.example.orders", "Order")).toBe("com.example.orders.Order");
  });

  it("names a type with no namespace by its name alone", () => {
    expect(avroFullName(undefined, "Event")).toBe("Event");
  });

  it("splits the namespace back off a full name", () => {
    expect(avroNamespaceOf(avroFullName("com.example.orders", "Order"))).toBe("com.example.orders");
  });

  it("joins the empty namespace it splits off back into the same name", () => {
    // The two directions have to meet in the middle. A split hands back the
    // empty namespace for a name that carries none, so a join has to read
    // that as no namespace too. A ".Event" is a name a reader never finds.
    expect(avroFullName(avroNamespaceOf("Event"), "Event")).toBe("Event");
  });

  it("reads an empty namespace off a name that carries none", () => {
    // A name with no dot has no namespace. A search for the last dot finds
    // nothing, and the answer is the empty namespace rather than the name
    // with its last character cut off.
    expect(avroNamespaceOf(avroFullName(undefined, "Event"))).toBe("");
  });
});
