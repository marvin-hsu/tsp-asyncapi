import { describe, expect, it } from "vitest";
import { t } from "@typespec/compiler/testing";
import { UnserializableValueError } from "@typespec/compiler";
import type { ModelProperty, Program, ScalarValue } from "@typespec/compiler";
import { AsyncAPITester } from "#emitter/testing.js";
import {
  makeSerializeHandlers,
  serializeDefaultValue,
  serializeExamples,
} from "#core/example-serialization.js";

/**
 * The two example builders share this module, and both of them turn a
 * TypeSpec value into plain JSON.
 *
 * Every case below drives it directly. The emitter drives it as well, but
 * through a whole document, and a document reports a dropped value as one
 * diagnostic among many. Here the drop is the result.
 */

describe("Unit: makeSerializeHandlers — a scalar the serializer cannot represent", () => {
  it("turns the silent undefined of the compiler into a throw", async () => {
    const value = await scalarValue();
    const handlers = makeSerializeHandlers();

    // The compiler answers `undefined` for a scalar constructor it does not
    // know. Nested inside an array or an object, that `undefined` would stay
    // buried in the result, and the caller would emit an example with a hole
    // in it. The throw is what lets the caller drop the whole value.
    expect(() =>
      handlers?.serializeScalarValue?.(value, value.scalar, undefined, () => undefined),
    ).toThrow(UnserializableValueError);
  });

  it("names the scalar it could not represent", async () => {
    const value = await scalarValue();
    const handlers = makeSerializeHandlers();

    expect(() =>
      handlers?.serializeScalarValue?.(value, value.scalar, undefined, () => undefined),
    ).toThrow(value.scalar.name);
  });

  it("passes a scalar the compiler did represent through", async () => {
    const value = await scalarValue();
    const handlers = makeSerializeHandlers();

    // The handler adds a check and nothing else. A represented value reaches
    // the caller as the compiler wrote it.
    expect(handlers?.serializeScalarValue?.(value, value.scalar, undefined, () => 7)).toBe(7);
  });
});

describe("Unit: serializeDefaultValue — the default a property carries", () => {
  it("answers undefined for a property with no default", async () => {
    const { properties, program } = await propertiesOf(`{ plain?: string; }`);

    let dropped = 0;
    expect(
      serializeDefaultValue(program, property(properties, "plain"), () => (dropped += 1)),
    ).toBeUndefined();
    expect(dropped).toBe(0);
  });

  it("serializes a default the compiler can represent", async () => {
    const { properties, program } = await propertiesOf(`{ plain?: string = "hi"; }`);

    expect(serializeDefaultValue(program, property(properties, "plain"), () => undefined)).toBe(
      "hi",
    );
  });

  it("applies the encoding the property declares", async () => {
    const { properties, program } = await propertiesOf(`{
      @encode("unixTimestamp", int32)
      ts?: utcDateTime = utcDateTime.fromISO("2020-01-01T00:00:00Z");
    }`);

    // The schema of this property says `type: "integer"`, because the
    // encoding is written into it. A default serialized as a date string
    // would fail to validate against the schema it is a default of.
    expect(serializeDefaultValue(program, property(properties, "ts"), () => undefined)).toBe(
      1577836800,
    );
  });

  it("drops a default the compiler cannot represent, and reports it", async () => {
    const { properties, program } = await propertiesOf(
      `{ d?: duration = duration.fromISO("nonsense"); }`,
    );

    // The compiler never validates the text of a `duration.fromISO` value.
    // The serializer reaches it and throws a plain `RangeError`, which this
    // module answers with a drop rather than a failed emit.
    let dropped = 0;
    expect(
      serializeDefaultValue(program, property(properties, "d"), () => (dropped += 1)),
    ).toBeUndefined();
    expect(dropped).toBe(1);
  });
});

describe("Unit: serializeExamples — the examples a declaration carries", () => {
  it("answers an empty list for a declaration with no example", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { M, program } = await runner.compile(t.code`
      model ${t.model("M")} { name: string; }
    `);

    let dropped = 0;
    expect(serializeExamples(program, M, M, () => (dropped += 1))).toEqual([]);
    expect(dropped).toBe(0);
  });

  it("keeps the examples in the order they were written", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { M, program } = await runner.compile(t.code`
      @example(#{ name: "first" })
      @example(#{ name: "second" })
      @example(#{ name: "third" })
      model ${t.model("M")} { name: string; }
    `);

    // A decorator list is read bottom up, so source order is a decision this
    // module makes rather than the order it is handed.
    expect(serializeExamples(program, M, M, () => undefined)).toEqual([
      { name: "first" },
      { name: "second" },
      { name: "third" },
    ]);
  });

  it("drops the example it cannot represent, and reports its place", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { M, program } = await runner.compile(t.code`
      @example(#{ d: duration.fromISO("PT1S") })
      @example(#{ d: duration.fromISO("nonsense") })
      @example(#{ d: duration.fromISO("PT2S") })
      model ${t.model("M")} { d: duration; }
    `);

    // The index is the place in source order, which is what a diagnostic
    // reports to the author. An index into the surviving values would point
    // at the wrong example.
    const dropped: number[] = [];
    expect(serializeExamples(program, M, M, (index) => dropped.push(index))).toEqual([
      { d: "PT1S" },
      { d: "PT2S" },
    ]);
    expect(dropped).toEqual([1]);
  });
});

/**
 * Compiles one model and hands back its properties.
 *
 * @param body - The body of the model, braces included
 * @returns The properties of the model, and the program they belong to
 */
async function propertiesOf(
  body: string,
): Promise<{ properties: Map<string, ModelProperty>; program: Program }> {
  const runner = await AsyncAPITester.createInstance();
  const { M, program } = await runner.compile(t.code`model ${t.model("M")} ${body}`);
  return { properties: M.properties, program };
}

/**
 * One property of a compiled model.
 *
 * @param properties - The properties of the model
 * @param name - The property to read
 * @returns The property
 * @throws When the model declares no property of that name
 */
function property(properties: Map<string, ModelProperty>, name: string): ModelProperty {
  const found = properties.get(name);
  if (found === undefined) throw new Error(`The compiled model has no property '${name}'.`);
  return found;
}

/**
 * A scalar value out of a real compilation.
 *
 * The handler reads the scalar off the value it is given, so a value from
 * the compiler is what the cases need. A `utcDateTime` default is one.
 *
 * @returns The value the default of the property carries
 */
async function scalarValue(): Promise<ScalarValue> {
  const { properties } = await propertiesOf(
    `{ ts?: utcDateTime = utcDateTime.fromISO("2020-01-01T00:00:00Z"); }`,
  );
  const value = property(properties, "ts").defaultValue;
  if (value?.valueKind !== "ScalarValue") {
    throw new Error("The default of the property is not a scalar value.");
  }
  return value;
}
