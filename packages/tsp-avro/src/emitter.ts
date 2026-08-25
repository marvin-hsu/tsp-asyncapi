/**
 * The entry point of the Avro emitter.
 *
 * The TypeSpec compiler calls this function when a project asks for
 * `--emit tsp-avro`.
 *
 * It writes one file per model marked with `@record`. There is no other file,
 * and there is no index: an Avro schema stands alone, so a file is either the
 * whole schema or it is nothing.
 *
 * Every schema is built before any file is written. A record the walk refuses
 * reports a diagnostic, which is an error, and an error stops every write. So
 * a compile either writes the schemas the author asked for or it writes none.
 * A partial output would be worse than none: each file that did land would
 * look complete, and a schema registry would take it.
 *
 * A dry run writes nothing for the same reason the upstream Protobuf emitter
 * writes nothing: the compiler asked to be told what would happen, not to have
 * it happen.
 *
 * @public
 */

import { getDirectoryPath, resolvePath, type EmitContext } from "@typespec/compiler";
import { buildAvroRecord } from "./walk/model.js";
import { listRecords } from "./decorators/record.js";
import type { AvroEmitterOptions } from "./lib.js";
import { renderAvroFile } from "./render.js";
import type { AvroRecord } from "./types.js";

/**
 * The path of the file that holds one record.
 *
 * The namespace becomes directories, which is how the Avro tools and the
 * Java code generator lay a schema tree out.
 */
function pathOf(outputDir: string, schema: AvroRecord): string {
  const segments = schema.namespace === undefined ? [] : schema.namespace.split(".");
  return resolvePath(outputDir, ...segments, `${schema.name}.avsc`);
}

/**
 * Writes an `.avsc` file for every model marked with `@record`.
 *
 * @param context - The emit context the compiler supplies
 *
 * @public
 */
export async function $onEmit(context: EmitContext<AvroEmitterOptions>): Promise<void> {
  const program = context.program;

  const files: { path: string; text: string }[] = [];
  for (const model of listRecords(program)) {
    const schema = buildAvroRecord(program, model);
    if (schema === undefined) {
      continue;
    }
    files.push({ path: pathOf(context.emitterOutputDir, schema), text: renderAvroFile(schema) });
  }

  if (program.compilerOptions.dryRun === true || program.hasError()) {
    return;
  }

  for (const file of files) {
    await program.host.mkdirp(getDirectoryPath(file.path));
    await program.host.writeFile(file.path, file.text);
  }
}
