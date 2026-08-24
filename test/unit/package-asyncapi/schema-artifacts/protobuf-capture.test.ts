/**
 * The measurements that decide whether the Protobuf host capture is usable.
 *
 * Four properties are checked here, and each one has to hold before the
 * adapter can go further:
 *
 * 1. A program with real official decorators produces non-empty proto3 text.
 * 2. A normal run leaves `writeFile` and `mkdirp` as they were.
 * 3. A run where the official emitter throws leaves them as they were too, and
 *    writes nothing to the real disk.
 * 4. A compilation that runs the official emitter as well reports its
 *    diagnostics once, not twice.
 *
 * The official emitter is real in every case here. Only the failure case
 * replaces it, and it does that with a loader, so the capture itself is the
 * same code in all four.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { EmitContext, Program } from "@typespec/compiler";
import { createTester } from "@typespec/compiler/testing";
import type { TesterInstance } from "@typespec/compiler/testing";
import { captureProtobufFiles } from "#emitter/schema-artifacts/protobuf-capture.js";

/*
 * The host methods are plain functions on an object, and neither reads `this`.
 * These tests hold and compare the function objects themselves, which is what
 * the capture has to put back. Binding them would compare a new object every
 * time and check nothing.
 */
/* eslint-disable @typescript-eslint/unbound-method */

/** The root of the emitter package, which holds both libraries as dependencies. */
const PACKAGE_ROOT = fileURLToPath(new URL("../../../../packages/tsp-asyncapi", import.meta.url));

/**
 * A tester that loads this emitter and the official Protobuf library.
 *
 * Only `AsyncAPI` is brought into scope. The Protobuf decorators are written
 * with their full name, because `@message` exists in both namespaces.
 */
const ProtobufTester = createTester(PACKAGE_ROOT, {
  libraries: ["tsp-asyncapi", "@typespec/protobuf"],
})
  .importLibraries()
  .using("AsyncAPI");

/** A package with one message in it, annotated the way an author would. */
const ONE_PACKAGE = `
  @service(#{ title: "Orders" })
  @TypeSpec.Protobuf.package({ name: "com.example.orders" })
  namespace Test;

  @message
  @TypeSpec.Protobuf.message
  model OrderCreated {
    @TypeSpec.Protobuf.field(1)
    orderId: string;

    @TypeSpec.Protobuf.field(2)
    total: int32;
  }
`;

/**
 * A package the official emitter reports a diagnostic about.
 *
 * A property of a `@message` model without `@field` has no field index, and
 * the official emitter reports `field-index` for it. The report is
 * unconditional. Some other codes go through a helper that reports one code
 * per target only once per program, and those cannot duplicate at all.
 */
const DUPLICATING_PACKAGE = `
  @service(#{ title: "Orders" })
  @TypeSpec.Protobuf.package({ name: "com.example.orders" })
  namespace Test;

  @message
  @TypeSpec.Protobuf.message
  model OrderCreated {
    orderId: string;
  }
`;

/**
 * A package that makes the official emitter throw.
 *
 * `PackageDetails.options` is declared as `Record<string | boolean | numeric>`,
 * and the official emitter reads each option as a literal value. A property
 * typed as the scalar `string` satisfies the constraint and is not a literal,
 * so the official emitter throws `Unexpected option type Scalar`.
 *
 * Nothing is reported before that throw. So this case reaches the failure path
 * of the capture and no diagnostic hides it.
 */
const THROWING_PACKAGE = `
  @service(#{ title: "Orders" })
  @TypeSpec.Protobuf.package({
    name: "com.example.orders",
    options: { java_package: string },
  })
  namespace Test;

  @message
  @TypeSpec.Protobuf.message
  model OrderCreated {
    @TypeSpec.Protobuf.field(1)
    orderId: string;
  }
`;

/** A performance reporter that records nothing. The official emitter reads none of it. */
const perf: EmitContext["perf"] = {
  startTimer: () => ({ end: () => 0 }),
  time: (_label, callback) => callback(),
  timeAsync: (_label, callback) => callback(),
  report: () => undefined,
};

/** The text of every captured file, joined for a content assertion. */
function allText(files: ReadonlyMap<string, string>): string {
  return [...files.values()].join("\n");
}

/** The code of the diagnostic the duplication case measures. */
const FIELD_INDEX = "@typespec/protobuf/field-index";

/** How many diagnostics of one code a program holds. */
function countOf(program: Program, code: string): number {
  return program.diagnostics.filter((diagnostic) => diagnostic.code === code).length;
}

describe("Unit: Protobuf host capture (Phase 16 P2)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await ProtobufTester.createInstance();
  });

  it("captures non-empty proto3 text from the official decorators", async () => {
    await runner.compileAndDiagnose(ONE_PACKAGE);

    const captured = await captureProtobufFiles(runner.program, perf);

    expect(captured.files.size).toBeGreaterThan(0);
    const text = allText(captured.files);
    expect(text).toContain('syntax = "proto3";');
    expect(text).toContain("package com.example.orders;");
    expect(text).toContain("message OrderCreated");
    expect(text).toContain("string orderId = 1;");
  });

  it("leaves both host methods as they were after a normal run", async () => {
    await runner.compileAndDiagnose(ONE_PACKAGE);
    const program = runner.program;
    const writeFile = program.host.writeFile;
    const mkdirp = program.host.mkdirp;

    await captureProtobufFiles(program, perf);

    expect(program.host.writeFile).toBe(writeFile);
    expect(program.host.mkdirp).toBe(mkdirp);
  });

  it("leaves both host methods as they were when the official emitter throws", async () => {
    await runner.compileAndDiagnose(THROWING_PACKAGE);
    const program = runner.program;

    // The originals are wrapped first, so the run can be checked for a write
    // that escaped the capture.
    let hostCalls = 0;
    const writeFile = program.host.writeFile;
    const mkdirp = program.host.mkdirp;
    const countingWriteFile: typeof writeFile = (...args) => {
      hostCalls += 1;
      return writeFile(...args);
    };
    const countingMkdirp: typeof mkdirp = (...args) => {
      hostCalls += 1;
      return mkdirp(...args);
    };
    program.host.writeFile = countingWriteFile;
    program.host.mkdirp = countingMkdirp;

    await expect(captureProtobufFiles(program, perf)).rejects.toThrow("Unexpected option type");

    expect(program.host.writeFile).toBe(countingWriteFile);
    expect(program.host.mkdirp).toBe(countingMkdirp);
    expect(hostCalls).toBe(0);
    expect(existsSync("/tsp-asyncapi-protobuf-capture")).toBe(false);
  });

  it("restores the host when a replaced emitter throws before it writes", async () => {
    await runner.compileAndDiagnose(ONE_PACKAGE);
    const program = runner.program;
    const writeFile = program.host.writeFile;
    const mkdirp = program.host.mkdirp;

    const failing = () =>
      Promise.resolve(() => {
        throw new Error("official emitter failed");
      });

    await expect(captureProtobufFiles(program, perf, failing)).rejects.toThrow(
      "official emitter failed",
    );

    expect(program.host.writeFile).toBe(writeFile);
    expect(program.host.mkdirp).toBe(mkdirp);
  });

  it("reports a diagnostic once when the official emitter runs in the same compilation", async () => {
    await runner.compileAndDiagnose(DUPLICATING_PACKAGE, {
      compilerOptions: { emit: ["@typespec/protobuf"], outputDir: "tsp-output" },
    });
    const program = runner.program;

    // What the official emitter reported on its own.
    const fromOfficialEmitter = countOf(program, FIELD_INDEX);
    expect(fromOfficialEmitter).toBe(1);

    const captured = await captureProtobufFiles(program, perf);

    // The capture produced the same diagnostic. That is the duplicate the
    // project would read, and the capture took it back off the program.
    expect(
      captured.diagnostics.filter((diagnostic) => diagnostic.code === FIELD_INDEX),
    ).toHaveLength(1);
    expect(countOf(program, FIELD_INDEX)).toBe(fromOfficialEmitter);
  });
});
