/**
 * Running the official Protobuf emitter and keeping its output in memory.
 *
 * The official `@typespec/protobuf` emitter turns a whole program into `.proto`
 * text. This adapter wants that text, not the files. So it calls the official
 * `$onEmit` with the two host methods that reach the disk replaced.
 *
 * Two methods are replaced, not one. The official emitter calls
 * `program.host.mkdirp` before every `program.host.writeFile`. A capture that
 * replaced `writeFile` alone would still leave an empty directory tree on the
 * real disk.
 *
 * Both methods are restored in a `finally`. The official emitter throws on some
 * programs, and a host left replaced would break every later write of the
 * compilation.
 *
 * ## Why the diagnostics are taken off the program
 *
 * The official emitter reports against the shared program. A project may also
 * run the official emitter itself in the same compilation. Both invocations
 * then report the same problem about the same target, and the project sees each
 * message twice.
 *
 * The adapter cannot stop the official emitter from reporting. What it can do
 * is take back what its own invocation added. `program.diagnostics` is the
 * array the compiler appends to, so the entries this invocation appended are
 * the tail of it. They are removed and returned to the caller, which decides
 * what to report.
 *
 * One effect of a reported error does not come back. The compiler sets an
 * internal error flag when it accepts an error diagnostic, and removing the
 * entry leaves that flag set. So this capture must run before anything that
 * reads `program.hasError()`.
 */

import type { Diagnostic, EmitContext, Program } from "@typespec/compiler";

/**
 * The performance reporter of an emit context.
 *
 * The compiler does not export the type by name, so it is read off the context
 * that carries it.
 */
type CapturePerf = EmitContext["perf"];

/**
 * The directory the capture tells the official emitter to write under.
 *
 * Nothing reaches the disk, so the path only has to be absolute and stable.
 * The official emitter builds every file path under it, and the capture keys
 * its result by those paths.
 */
const CAPTURE_OUTPUT_DIR = "/tsp-asyncapi-protobuf-capture";

/** The options the capture gives the official emitter. */
const CAPTURE_OPTIONS = { "omit-unreachable-types": true } as const;

/**
 * The signature of the official emitter, narrowed to what the capture passes.
 *
 * The capture builds the context itself, because it does not run as a
 * registered emitter. `EmitContext` in the pinned compiler holds exactly four
 * fields, and this type names all of them.
 *
 * @internal
 */
export type ProtobufEmit = (context: {
  program: Program;
  emitterOutputDir: string;
  options: typeof CAPTURE_OPTIONS;
  perf: CapturePerf;
}) => Promise<void>;

/**
 * What one capture produced.
 *
 * @internal
 */
export interface ProtobufCaptureResult {
  /** The text of every `.proto` file, by the path it would have been written to. */
  readonly files: ReadonlyMap<string, string>;
  /** Every diagnostic the official emitter reported during this invocation. */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Loads the official emitter.
 *
 * The import is dynamic so the package is read only when a project turns the
 * preview feature on. The package is a direct dependency at an exact version,
 * so the import always resolves.
 *
 * @returns The `$onEmit` of `@typespec/protobuf`
 */
async function loadProtobufEmit(): Promise<ProtobufEmit> {
  const { $onEmit } = await import("@typespec/protobuf");
  return $onEmit;
}

/**
 * Runs the official Protobuf emitter and collects its output in memory.
 *
 * @param program - The compiled program
 * @param perf - The performance reporter this emitter was given
 * @param load - Loads the emitter to run. A test passes its own to force a
 * failure.
 * @returns The captured files, and the diagnostics taken off the program
 * @internal
 */
export async function captureProtobufFiles(
  program: Program,
  perf: CapturePerf,
  load: () => Promise<ProtobufEmit> = loadProtobufEmit,
): Promise<ProtobufCaptureResult> {
  const files = new Map<string, string>();
  // The host methods are plain functions on an object, and neither reads
  // `this`. They are held by reference so the same function objects go back.
  /* eslint-disable @typescript-eslint/unbound-method */
  const originalWriteFile = program.host.writeFile;
  const originalMkdirp = program.host.mkdirp;
  /* eslint-enable @typescript-eslint/unbound-method */
  const diagnosticsBefore = program.diagnostics.length;

  program.host.writeFile = (path: string, content: string) => {
    files.set(path, content);
    return Promise.resolve();
  };
  // The official emitter creates the package directory before it writes. This
  // replacement keeps the collection run from creating directories on disk.
  program.host.mkdirp = (path: string) => Promise.resolve(path);

  try {
    const emitProtobuf = await load();
    await emitProtobuf({
      program,
      emitterOutputDir: CAPTURE_OUTPUT_DIR,
      options: CAPTURE_OPTIONS,
      perf,
    });
  } finally {
    program.host.writeFile = originalWriteFile;
    program.host.mkdirp = originalMkdirp;
  }

  return { files, diagnostics: takeDiagnosticsSince(program, diagnosticsBefore) };
}

/**
 * Removes the diagnostics the capture added and hands them back.
 *
 * The compiler appends to one array, and no other reporter runs while the
 * capture awaits. So everything after `before` belongs to this invocation.
 *
 * @param program - The program the capture reported against
 * @param before - The diagnostic count taken before the invocation
 * @returns The removed diagnostics, in the order they were reported
 */
function takeDiagnosticsSince(program: Program, before: number): readonly Diagnostic[] {
  if (program.diagnostics.length <= before) return [];
  // The compiler exposes its own array through a readonly type. Truncating it
  // is the only way to take an entry back, because nothing removes one.
  const reported = program.diagnostics as Diagnostic[];
  return reported.splice(before, reported.length - before);
}
