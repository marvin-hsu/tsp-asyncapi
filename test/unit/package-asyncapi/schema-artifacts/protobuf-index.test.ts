/**
 * Mapping each `@Protobuf.message` model to the proto3 text of its package.
 *
 * The mapping is the part of the adapter that a file name or a same-named
 * message would get wrong. These cases are the ones that tell the two apart:
 * a renamed package, a nested namespace, and two packages that hold a model of
 * one name. A model with no package is here too, because it has to report
 * instead of producing an empty payload.
 *
 * Every case compiles the official decorators and runs the official emitter.
 *
 * Both libraries are loaded, because the mapping reports only about a model
 * the document asks a payload for. Each of the two declares a decorator named
 * `message`, so every source here writes the AsyncAPI one qualified.
 *
 * The models are looked up by namespace and name instead of with a tester
 * marker. Two of these cases declare one model name twice, and a marker names
 * each model once.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { Diagnostic, EmitContext, Model, Program } from "@typespec/compiler";
import { createTester } from "@typespec/compiler/testing";
import type { TesterInstance } from "@typespec/compiler/testing";
import { fileURLToPath } from "node:url";
import { captureProtobufFiles } from "#emitter/schema-artifacts/protobuf-capture.js";
import { indexProtobufArtifacts } from "#emitter/schema-artifacts/protobuf-index.js";
import { PACKAGE_NAME } from "#emitter/lib.js";
import type { SchemaArtifactIndex } from "tsp-asyncapi-core";

/** The root of the emitter package, which holds the official library as a dependency. */
const PACKAGE_ROOT = fileURLToPath(new URL("../../../../packages/tsp-asyncapi", import.meta.url));

/**
 * A tester that loads this emitter and the official Protobuf library.
 *
 * Only the Protobuf namespace is opened. `@AsyncAPI.message` is written out in
 * full, because the other library exports that name too.
 */
const ProtobufTester = createTester(PACKAGE_ROOT, {
  libraries: [PACKAGE_NAME, "@typespec/protobuf"],
})
  .importLibraries()
  .using("TypeSpec.Protobuf");

/** A performance reporter that records nothing. The official emitter reads none of it. */
const perf: EmitContext["perf"] = {
  startTimer: () => ({ end: () => 0 }),
  time: (_label, callback) => callback(),
  timeAsync: (_label, callback) => callback(),
  report: () => undefined,
};

/** The code every unavailable artifact reports. */
const UNAVAILABLE = "tsp-asyncapi/protobuf-artifact-unavailable";

/** What one indexed program produced. */
interface Indexed {
  /** The artifacts of that program. */
  readonly artifacts: SchemaArtifactIndex;
  /** What the mapping reported while it built them. */
  readonly reported: readonly Diagnostic[];
}

describe("Unit: Protobuf artifact index (Phase 16 P3)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await ProtobufTester.createInstance();
  });

  /**
   * Compiles a program, captures the official output, and indexes it.
   *
   * @param code - The TypeSpec source of the case
   * @returns The artifacts, and the diagnostics the mapping reported
   */
  async function index(code: string): Promise<Indexed> {
    await runner.compileAndDiagnose(code);
    const program = runner.program;
    const before = program.diagnostics.length;
    const captured = await captureProtobufFiles(program, perf);
    const { artifacts } = indexProtobufArtifacts(program, captured);
    return { artifacts, reported: program.diagnostics.slice(before) };
  }

  /**
   * Finds one model by the namespace that holds it.
   *
   * @param path - The namespace names from the global one down, dot separated
   * @param name - The name of the model
   * @returns The model that declaration produced
   */
  function modelIn(path: string, name: string): Model {
    const program: Program = runner.program;
    let namespace = program.getGlobalNamespaceType();
    for (const part of path.split(".")) {
      const child = namespace.namespaces.get(part);
      if (child === undefined) throw new Error(`No namespace '${path}' in the program.`);
      namespace = child;
    }
    const model = namespace.models.get(name);
    if (model === undefined) throw new Error(`No model '${name}' in namespace '${path}'.`);
    return model;
  }

  it("maps a model to the package its decorator renames", async () => {
    const { artifacts, reported } = await index(`
      @package({ name: "com.example.orders" })
      namespace Orders {
        @AsyncAPI.message
        @message
        model OrderCreated {
          @field(1)
          orderId: string;
        }
      }
    `);

    expect(reported).toHaveLength(0);
    const artifact = artifacts.payloadFor.get(modelIn("Orders", "OrderCreated"));
    // The identity is the name the decorator gives, not the namespace name.
    expect(artifact?.identity).toBe("com.example.orders");
    expect(artifact?.provider).toBe("protobuf");
    expect(artifact?.schemaFormat).toBe("application/vnd.google.protobuf;version=3");
    expect(artifact?.schema).toContain("package com.example.orders;");
    expect(artifact?.schema).toContain("string orderId = 1;");
  });

  it("resolves a nested namespace to its nearest package", async () => {
    const { artifacts, reported } = await index(`
      @package({ name: "com.example.outer" })
      namespace Shipping {
        @AsyncAPI.message
        @message
        model Parcel {
          @field(1)
          id: string;
        }

        @package({ name: "com.example.inner" })
        namespace Deep {
          @AsyncAPI.message
          @message
          model Label {
            @field(1)
            code: string;
          }
        }
      }
    `);

    expect(reported).toHaveLength(0);
    const inner = artifacts.payloadFor.get(modelIn("Shipping.Deep", "Label"));
    const outer = artifacts.payloadFor.get(modelIn("Shipping", "Parcel"));
    // The inner namespace declares a package of its own, so the outer one loses.
    expect(inner?.identity).toBe("com.example.inner");
    expect(inner?.schema).toContain("string code = 1;");
    expect(inner?.schema).not.toContain("message Parcel");
    // The nearest package wins on both sides of the boundary, so the outer
    // file holds its own model and not the one the inner package claimed.
    expect(outer?.identity).toBe("com.example.outer");
    expect(outer?.schema).toContain("message Parcel");
    expect(outer?.schema).not.toContain("message Label");
  });

  it("keeps two packages apart when both hold a model of one name", async () => {
    const { artifacts, reported } = await index(`
      @package({ name: "com.example.left" })
      namespace Left {
        @AsyncAPI.message
        @message
        model OrderCreated {
          @field(1)
          leftOnly: string;
        }
      }

      @package({ name: "com.example.right" })
      namespace Right {
        @AsyncAPI.message
        @message
        model OrderCreated {
          @field(1)
          rightOnly: string;
        }
      }
    `);

    expect(reported).toHaveLength(0);
    const left = artifacts.payloadFor.get(modelIn("Left", "OrderCreated"));
    const right = artifacts.payloadFor.get(modelIn("Right", "OrderCreated"));
    expect(left?.identity).toBe("com.example.left");
    expect(right?.identity).toBe("com.example.right");
    // Each text holds its own field, so neither model got the other package.
    expect(left?.schema).toContain("string leftOnly = 1;");
    expect(left?.schema).not.toContain("string rightOnly = 1;");
    expect(right?.schema).toContain("string rightOnly = 1;");
    expect(right?.schema).not.toContain("string leftOnly = 1;");
  });

  it("gives every model of one package the same artifact", async () => {
    const { artifacts } = await index(`
      @package({ name: "com.example.orders" })
      namespace Orders {
        @AsyncAPI.message
        @message
        model First {
          @field(1)
          id: string;
        }

        @AsyncAPI.message
        @message
        model Second {
          @field(1)
          total: int32;
        }
      }
    `);

    const first = artifacts.payloadFor.get(modelIn("Orders", "First"));
    expect(first).toBeDefined();
    expect(artifacts.payloadFor.get(modelIn("Orders", "Second"))).toBe(first);
    // The artifact is the whole package, so it holds both messages.
    expect(first?.schema).toContain("message First");
    expect(first?.schema).toContain("message Second");
  });

  it("reports a model that carries the decorator with no package above it", async () => {
    const { artifacts, reported } = await index(`
      namespace Loose {
        @AsyncAPI.message
        @message
        model Detached {
          @field(1)
          id: string;
        }
      }
    `);

    const model = modelIn("Loose", "Detached");
    expect(artifacts.payloadFor.has(model)).toBe(false);
    const unavailable = reported.find((diagnostic) => diagnostic.code === UNAVAILABLE);
    expect(unavailable?.message).toContain("Detached");
    expect(unavailable?.message).toContain("@Protobuf.package");
    expect(unavailable?.target).toBe(model);
  });

  it("stays quiet about a Protobuf model the document never mentions", async () => {
    // The official decorators are also used for types outside the document. A
    // model with no AsyncAPI message asks for no payload, so it gets no error.
    const { artifacts, reported } = await index(`
      namespace Internal {
        @message
        model GrpcOnly {
          @field(1)
          id: string;
        }
      }
    `);

    expect(reported).toHaveLength(0);
    expect(artifacts.payloadFor.size).toBe(0);
  });

  it("maps a package that declares no name", async () => {
    const { artifacts, reported } = await index(`
      @package
      namespace Plain {
        @AsyncAPI.message
        @message
        model Ping {
          @field(1)
          id: string;
        }
      }
    `);

    expect(reported).toHaveLength(0);
    // The official emitter writes no `package` line for such a package, so
    // the text is matched by the absence of one.
    const artifact = artifacts.payloadFor.get(modelIn("Plain", "Ping"));
    expect(artifact?.identity).toBe("(no package name)");
    expect(artifact?.schema).toContain("message Ping");
    expect(artifact?.schema).not.toContain("package ");
  });

  it("stays quiet on a dry run, where nothing is written anyway", async () => {
    // The official emitter writes no file on a dry run. That is one cause for
    // the whole program, and the compilation writes no document either, so a
    // per-model error would name a problem the author does not have.
    await runner.compileAndDiagnose(
      `
      @package({ name: "com.example.orders" })
      namespace Orders {
        @AsyncAPI.message
        @message
        model OrderCreated {
          @field(1)
          orderId: string;
        }
      }
    `,
      { compilerOptions: { dryRun: true } },
    );
    const program = runner.program;
    const before = program.diagnostics.length;
    const captured = await captureProtobufFiles(program, perf);
    const { artifacts } = indexProtobufArtifacts(program, captured);

    expect(captured.files.size).toBe(0);
    expect(artifacts.payloadFor.size).toBe(0);
    expect(program.diagnostics.slice(before)).toHaveLength(0);
  });

  it("reports a model whose package produced no file", async () => {
    // No captured file, no captured error, and a healthy program. The cause is
    // the package itself, so the diagnostic points at the namespace declaring it.
    await runner.compileAndDiagnose(`
      @package({ name: "com.example.orders" })
      namespace Orders {
        @AsyncAPI.message
        @message
        model OrderCreated {
          @field(1)
          orderId: string;
        }
      }
    `);
    const program = runner.program;
    const before = program.diagnostics.length;
    const { artifacts } = indexProtobufArtifacts(program, {
      files: new Map(),
      diagnostics: [],
    });

    expect(artifacts.payloadFor.size).toBe(0);
    const unavailable = program.diagnostics
      .slice(before)
      .find((diagnostic) => diagnostic.code === UNAVAILABLE);
    expect(unavailable?.message).toContain("produced no file");
    expect(unavailable?.message).toContain("com.example.orders");
    expect(unavailable?.target).toBe(modelIn("Orders", "OrderCreated").namespace);
  });

  it("reports a model the official emitter refused to convert", async () => {
    // A property with no `@field` has no field index, and the official emitter
    // reports an error about it. That emitter writes nothing after an error,
    // so the model has to be told what actually happened.
    const { artifacts, reported } = await index(`
      @package({ name: "com.example.orders" })
      namespace Orders {
        @AsyncAPI.message
        @message
        model Broken {
          orderId: string;
        }
      }
    `);

    const model = modelIn("Orders", "Broken");
    expect(artifacts.payloadFor.has(model)).toBe(false);
    const unavailable = reported.find((diagnostic) => diagnostic.code === UNAVAILABLE);
    expect(unavailable?.message).toContain("refused to convert");
    expect(unavailable?.message).toContain("com.example.orders");
    // The error of the official emitter is what the author has to act on, so
    // the capture must not swallow it.
    expect(reported.some((diagnostic) => diagnostic.code.startsWith("@typespec/protobuf/"))).toBe(
      true,
    );
  });

  it("keeps the error of a problem no model diagnostic covers", async () => {
    // A package name used twice is reported against a namespace. No artifact
    // diagnostic names a namespace, so without the capture putting the error
    // back the compilation would fail with nothing to read.
    const { reported } = await index(`
      @package({ name: "com.example.orders" })
      namespace Left {
        @AsyncAPI.message
        @message
        model Placed {
          @field(1)
          id: string;
        }
      }

      @package({ name: "com.example.orders" })
      namespace Right {
        @AsyncAPI.message
        @message
        model Shipped {
          @field(1)
          id: string;
        }
      }
    `);

    const collision = reported.find((diagnostic) =>
      diagnostic.code.endsWith("namespace-collision"),
    );
    expect(collision).toBeDefined();
    expect(collision?.message).toContain("com.example.orders");
  });

  it("throws when two captured files claim one package name", async () => {
    // The pinned official emitter cannot produce this. The adapter reads its
    // undocumented behavior, so an upgrade that changes it has to stop here
    // rather than hand a model the text of another package.
    await runner.compileAndDiagnose(`
      @package({ name: "com.example.orders" })
      namespace Orders {
        @AsyncAPI.message
        @message
        model OrderCreated {
          @field(1)
          orderId: string;
        }
      }
    `);

    const files = new Map([
      ["/out/first.proto", 'syntax = "proto3";\n\npackage com.example.orders;\n\nmessage A {}\n'],
      ["/out/second.proto", 'syntax = "proto3";\n\npackage com.example.orders;\n\nmessage B {}\n'],
    ]);

    expect(() => indexProtobufArtifacts(runner.program, { files, diagnostics: [] })).toThrow(
      /com\.example\.orders/,
    );
  });
});
