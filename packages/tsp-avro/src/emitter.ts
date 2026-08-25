import type { EmitContext } from "@typespec/compiler";
import type { AvroEmitterOptions } from "./lib.js";

/**
 * The entry point of the Avro emitter.
 *
 * The TypeSpec compiler calls this function when a project asks for
 * `--emit tsp-avro`.
 *
 * It writes no file yet. The walk that turns a TypeSpec model into an Avro
 * schema is not implemented, and a file written now would hold nothing.
 *
 * @param context - The program to emit, and the emitter options
 * @public
 */
export function $onEmit(context: EmitContext<AvroEmitterOptions>): void {
  const program = context.program;

  // Two compilations get no output at all, and the check stays once the walk
  // exists. A dry run asks the compiler for diagnostics without files. A
  // compilation that already reported an error would produce a schema built
  // from types the author has to fix first.
  //
  // The upstream Protobuf emitter guards on the same two conditions.
  if (program.compilerOptions.dryRun === true || program.hasError()) {
    return;
  }

  // The walk lands here next. Nothing marks a model for output yet, so there
  // is nothing to write.
}
