import { describe, expect, it } from "vitest";
import type { Model, Namespace, Program } from "@typespec/compiler";
import { AsyncAPITester } from "#emitter/testing.js";
import {
  listProtobufMessageModels,
  protoMessageNameOf,
  resolveProtobufPackage,
} from "#core/protobuf-state.js";
import { namespaceOf } from "../../utils/namespace.js";

/**
 * The state keys of `@typespec/protobuf`, as the compiler builds them.
 *
 * The compiler derives every state symbol from the library name and the key
 * with `Symbol.for`, so a test can write the state the way that library does
 * without loading it. That is the whole premise of the reader under test: the
 * library writes, this emitter reads, and nothing at run time links the two.
 */
const MESSAGE_STATE = Symbol.for("@typespec/protobuf.message");
const PACKAGE_STATE = Symbol.for("@typespec/protobuf.package");

/**
 * The source every case compiles. `Details` stands in for the argument of
 * `@Protobuf.package`, which is a model type whose `name` property is a
 * string literal. `Unnamed` is that argument with no name in it.
 * `NameNotLiteral` stands in for a shape this reader does not know.
 */
const SOURCE = `
  namespace Outer {
    model Details { name: "com.example.outer"; }
    model Unnamed {}
    model NameNotLiteral { name: string; }
    model Root {}

    namespace Inner {
      model Details { name: "com.example.inner"; }
      model Leaf {}
    }
  }

  namespace Elsewhere {
    model Box<T> { value: T; }
    @friendlyName("renamed") model original {}
    model lower {}
    model Holder {
      plain: Box<string>;
    }
  }
`;

async function compiled(): Promise<Program> {
  const runner = await AsyncAPITester.createInstance();
  await runner.compile(SOURCE);
  return runner.program;
}

function modelIn(namespace: Namespace, name: string): Model {
  const model = namespace.models.get(name);
  if (model === undefined) throw new Error(`The test source declares no model '${name}'.`);
  return model;
}

function inner(program: Program): Namespace {
  const namespace = namespaceOf(program, "Outer").namespaces.get("Inner");
  if (namespace === undefined) throw new Error("The test source declares no namespace 'Inner'.");
  return namespace;
}

describe("Unit: Protobuf decorator state (Phase 16 W0)", () => {
  it("lists the models that carry @Protobuf.message", async () => {
    const program = await compiled();
    const outer = namespaceOf(program, "Outer");
    program.stateSet(MESSAGE_STATE).add(modelIn(outer, "Root"));
    program.stateSet(MESSAGE_STATE).add(modelIn(inner(program), "Leaf"));

    expect(listProtobufMessageModels(program).map((model) => model.name)).toEqual(["Root", "Leaf"]);
  });

  /**
   * The state belongs to another library, so its shape is not promised. A
   * value that is not a model is skipped rather than passed on as one.
   */
  it("skips an entry in the message state that is not a model", async () => {
    const program = await compiled();
    const outer = namespaceOf(program, "Outer");
    program.stateSet(MESSAGE_STATE).add(outer);
    program.stateSet(MESSAGE_STATE).add(modelIn(outer, "Root"));

    expect(listProtobufMessageModels(program).map((model) => model.name)).toEqual(["Root"]);
  });

  it("reads the package name from the details the decorator stored", async () => {
    const program = await compiled();
    const outer = namespaceOf(program, "Outer");
    program.stateMap(PACKAGE_STATE).set(outer, modelIn(outer, "Details"));

    expect(resolveProtobufPackage(program, modelIn(outer, "Root"))).toEqual({
      kind: "declared",
      namespace: outer,
      name: "com.example.outer",
    });
  });

  it("resolves a nested namespace to its nearest package", async () => {
    const program = await compiled();
    const outer = namespaceOf(program, "Outer");
    const nested = inner(program);
    program.stateMap(PACKAGE_STATE).set(outer, modelIn(outer, "Details"));
    program.stateMap(PACKAGE_STATE).set(nested, modelIn(nested, "Details"));

    expect(resolveProtobufPackage(program, modelIn(nested, "Leaf"))).toEqual({
      kind: "declared",
      namespace: nested,
      name: "com.example.inner",
    });
  });

  it("walks up to an outer package when the inner namespace declares none", async () => {
    const program = await compiled();
    const outer = namespaceOf(program, "Outer");
    program.stateMap(PACKAGE_STATE).set(outer, modelIn(outer, "Details"));

    expect(resolveProtobufPackage(program, modelIn(inner(program), "Leaf"))?.namespace).toBe(outer);
  });

  it("returns no package when no namespace above the model declares one", async () => {
    const program = await compiled();
    const outer = namespaceOf(program, "Outer");

    expect(resolveProtobufPackage(program, modelIn(outer, "Root"))).toBeUndefined();
  });

  it("keeps a package that declares no name", async () => {
    const program = await compiled();
    const outer = namespaceOf(program, "Outer");
    program.stateMap(PACKAGE_STATE).set(outer, modelIn(outer, "Unnamed"));

    expect(resolveProtobufPackage(program, modelIn(outer, "Root"))).toEqual({
      kind: "declared",
      namespace: outer,
      name: undefined,
    });
  });

  it("treats a package with no details at all as unnamed", async () => {
    const program = await compiled();
    const outer = namespaceOf(program, "Outer");
    program.stateMap(PACKAGE_STATE).set(outer, undefined);

    expect(resolveProtobufPackage(program, modelIn(outer, "Root"))).toEqual({
      kind: "declared",
      namespace: outer,
      name: undefined,
    });
  });

  /**
   * A name that is not a string literal is a shape this reader does not know.
   * A package with no name at all prints no `package` line, so answering with
   * no name would turn a drift in the other library into wrong proto3 text.
   * The reader says the details are unreadable instead, and the caller refuses.
   */
  it("refuses a name that is not a string literal", async () => {
    const program = await compiled();
    const outer = namespaceOf(program, "Outer");
    program.stateMap(PACKAGE_STATE).set(outer, modelIn(outer, "NameNotLiteral"));

    expect(resolveProtobufPackage(program, modelIn(outer, "Root"))).toEqual({
      kind: "unreadable",
      namespace: outer,
    });
  });

  it("refuses details that are not a model", async () => {
    const program = await compiled();
    const outer = namespaceOf(program, "Outer");
    program.stateMap(PACKAGE_STATE).set(outer, outer);

    expect(resolveProtobufPackage(program, modelIn(outer, "Root"))).toEqual({
      kind: "unreadable",
      namespace: outer,
    });
  });

  it("capitalizes the name of a plain model", async () => {
    const program = await compiled();
    const elsewhere = namespaceOf(program, "Elsewhere");

    expect(protoMessageNameOf(program, modelIn(elsewhere, "lower"))).toBe("Lower");
  });

  it("capitalizes the friendly name of a model", async () => {
    const program = await compiled();
    const elsewhere = namespaceOf(program, "Elsewhere");

    expect(protoMessageNameOf(program, modelIn(elsewhere, "original"))).toBe("Renamed");
  });

  it("refuses to name a template instance", async () => {
    const program = await compiled();
    const elsewhere = namespaceOf(program, "Elsewhere");
    const instance = modelIn(elsewhere, "Holder").properties.get("plain")?.type;
    if (instance?.kind !== "Model") throw new Error("The property 'plain' is not a model.");

    expect(protoMessageNameOf(program, instance)).toBeUndefined();
  });
});
