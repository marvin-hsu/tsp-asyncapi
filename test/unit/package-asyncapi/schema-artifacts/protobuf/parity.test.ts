import { describe, expect, it } from "vitest";
import {
  descriptorOf,
  emitOfficialProto,
  expectDescriptorParity,
  renderPayload,
} from "../../../../utils/protobuf-parity.js";

/**
 * Descriptor parity between this emitter's renderer and the official one.
 *
 * Each case declares one package and compiles it twice. The model named in
 * the assertion has a closure that covers the whole package, so the payload
 * this emitter renders and the file the official emitter writes describe the
 * same set of declarations.
 *
 * A case that only asserted our own output would pass while the mapping
 * drifted away from the official one. These cases fail on that drift instead.
 */
describe("Unit: Protobuf payload parity (Phase 16 W1)", () => {
  /**
   * Every scalar the official library maps. Its table holds 15 rows: nine
   * built in TypeSpec scalars, and the six the Protobuf library declares. One
   * field here covers one row, so a changed row turns this case red.
   */
  it("maps every scalar the official table maps", async () => {
    const source = `
      @Protobuf.package({ name: "com.example.scalars" })
      namespace Scalars;

      @Protobuf.message
      model Every {
        @Protobuf.field(1) a: bytes;
        @Protobuf.field(2) b: boolean;
        @Protobuf.field(3) c: string;
        @Protobuf.field(4) d: int32;
        @Protobuf.field(5) e: int64;
        @Protobuf.field(6) f: uint32;
        @Protobuf.field(7) g: uint64;
        @Protobuf.field(8) h: float32;
        @Protobuf.field(9) i: float64;
        @Protobuf.field(10) j: Protobuf.sfixed32;
        @Protobuf.field(11) k: Protobuf.sfixed64;
        @Protobuf.field(12) l: Protobuf.sint32;
        @Protobuf.field(13) m: Protobuf.sint64;
        @Protobuf.field(14) n: Protobuf.fixed32;
        @Protobuf.field(15) o: Protobuf.fixed64;
      }
    `;
    await expectDescriptorParity(source, "Every");

    // The parity assertion above compares descriptors, so a table that mapped
    // two rows to one name would still pass it. This counts the distinct
    // proto3 names the case produced.
    const text = await renderPayload(source, "Every");
    const names = new Set([...text.matchAll(/^ {2}(\w+) \w+ = \d+;$/gm)].map((one) => one[1]));
    expect(names.size).toBe(15);
  });

  /** A custom scalar has no row of its own, so the walk follows what it extends. */
  it("falls back to the scalar a custom one extends", async () => {
    const source = `
      @Protobuf.package({ name: "com.example.fallback" })
      namespace Fallback;

      scalar Quantity extends int32;
      scalar Counted extends Quantity;

      @Protobuf.message
      model Order {
        @Protobuf.field(1) direct: Quantity;
        @Protobuf.field(2) chained: Counted;
      }
    `;
    await expectDescriptorParity(source, "Order");
    expect(await renderPayload(source, "Order")).toContain("int32 direct = 1;");
  });

  /** proto3 marks an optional scalar or enum, and nothing else. */
  it("labels an optional property the way the official emitter does", async () => {
    const source = `
      @Protobuf.package({ name: "com.example.optional" })
      namespace Opt;

      enum Colour { Red: 0, Green: 1 }

      model Inner {
        @Protobuf.field(1) value: string;
      }

      @Protobuf.message
      model Holder {
        @Protobuf.field(1) plain?: string;
        @Protobuf.field(2) enumerated?: Colour;
        @Protobuf.field(3) nested?: Inner;
        @Protobuf.field(4) required: string;
      }
    `;
    await expectDescriptorParity(source, "Holder");
  });

  /** An array becomes a repeated field, and an optional array does not. */
  it("labels an array as repeated", async () => {
    const source = `
      @Protobuf.package({ name: "com.example.repeated" })
      namespace Rep;

      model Item {
        @Protobuf.field(1) name: string;
      }

      @Protobuf.message
      model Basket {
        @Protobuf.field(1) tags: string[];
        @Protobuf.field(2) items: Item[];
      }
    `;
    await expectDescriptorParity(source, "Basket");
  });

  /** An enum reaches the closure and keeps its variant numbers. */
  it("renders an enum the way the official emitter does", async () => {
    const source = `
      @Protobuf.package({ name: "com.example.enums" })
      namespace Enums;

      enum Status {
        Unknown: 0,
        Active: 1,
        Retired: 2,
      }

      @Protobuf.message
      model Account {
        @Protobuf.field(1) status: Status;
      }
    `;
    await expectDescriptorParity(source, "Account");
  });

  /**
   * The closure of a payload is what that model reaches, and nothing else.
   *
   * `Envelope` reaches `Body`, so its payload carries both. `Body` reaches
   * nothing, so its payload carries only itself. The official file carries
   * both, which is why only the first of the two is compared against it.
   */
  it("carries the closure of the model, and only that", async () => {
    const source = `
      @Protobuf.package({ name: "com.example.closure" })
      namespace Closure;

      @Protobuf.message
      model Body {
        @Protobuf.field(1) text: string;
      }

      @Protobuf.message
      model Envelope {
        @Protobuf.field(1) body: Body;
        @Protobuf.field(2) id: string;
      }
    `;
    await expectDescriptorParity(source, "Envelope");

    const bodyOnly = await renderPayload(source, "Body");
    expect(bodyOnly).toContain("message Body {");
    expect(bodyOnly).not.toContain("message Envelope");

    const both = await renderPayload(source, "Envelope");
    expect(both).toContain("message Body {");
    expect(both).toContain("message Envelope {");
  });

  /**
   * A model that reaches itself terminates because its name enters the
   * closure before its fields are walked. Without that, the walk recurses
   * until the stack ends.
   */
  it("closes a model that reaches itself", async () => {
    const source = `
      @Protobuf.package({ name: "com.example.recursive" })
      namespace Recursive;

      @Protobuf.message
      model Node {
        @Protobuf.field(1) label: string;
        @Protobuf.field(2) children: Node[];
      }
    `;
    await expectDescriptorParity(source, "Node");

    const text = await renderPayload(source, "Node");
    expect([...text.matchAll(/^message /gm)]).toHaveLength(1);
  });

  /**
   * Two models that reach each other close the same way. Each payload holds
   * both, because each one reaches both.
   */
  it("closes two models that reach each other", async () => {
    const source = `
      @Protobuf.package({ name: "com.example.mutual" })
      namespace Mutual;

      @Protobuf.message
      model Parent {
        @Protobuf.field(1) children: Child[];
      }

      @Protobuf.message
      model Child {
        @Protobuf.field(1) parents: Parent[];
      }
    `;
    for (const name of ["Parent", "Child"]) {
      const text = await renderPayload(source, name);
      expect(text).toContain("message Parent {");
      expect(text).toContain("message Child {");
    }
  });

  /** A friendly name wins, and a plain name is capitalized. Both are mirrored. */
  it("names a message the way the official emitter names it", async () => {
    const source = `
      @Protobuf.package({ name: "com.example.naming" })
      namespace Naming;

      @friendlyName("renamedThing")
      @Protobuf.message
      model original {
        @Protobuf.field(1) via: string;
      }

      @Protobuf.message
      model lowercase {
        @Protobuf.field(1) plain: string;
      }
    `;
    // The official file holds both messages, so neither payload alone equals
    // it. The names are compared instead, which is what this case is about.
    const official = descriptorOf(await emitOfficialProto(source));
    const officialNames = Object.keys(nestedOf(official, "com.example.naming"));
    expect(new Set(officialNames)).toStrictEqual(new Set(["Lowercase", "RenamedThing"]));

    expect(await renderPayload(source, "original")).toContain("message RenamedThing {");
    expect(await renderPayload(source, "lowercase")).toContain("message Lowercase {");
  });
});

/**
 * Walks into the nested declarations of one package of a descriptor.
 *
 * @param root - The descriptor tree the parser produced
 * @param packageName - The dotted package name to walk down
 * @returns The declarations of that package
 */
function nestedOf(root: unknown, packageName: string): Record<string, unknown> {
  let current = root as { nested?: Record<string, unknown> };
  for (const part of packageName.split(".")) {
    const next = current.nested?.[part];
    if (next === undefined) throw new Error(`The descriptor has no package '${packageName}'.`);
    current = next as { nested?: Record<string, unknown> };
  }
  if (current.nested === undefined) throw new Error(`Package '${packageName}' holds nothing.`);
  return current.nested;
}
