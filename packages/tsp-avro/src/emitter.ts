/**
 * The entry point of the Avro emitter.
 *
 * The TypeSpec compiler calls this function for `--emit tsp-avro`. It writes
 * one file per model marked with `@record`, and no index: an Avro schema
 * stands alone.
 *
 * Every schema builds before any file writes. A record the walk refuses
 * reports a diagnostic, and any diagnostic here stops every write. A partial
 * output would be worse than none: each file that did land would look
 * complete, and a schema registry would accept it.
 *
 * A dry run writes nothing, for the same reason the upstream Protobuf emitter
 * writes nothing: the compiler asked what would happen, not for it to happen.
 *
 * @public
 */

import {
  getDirectoryPath,
  getTypeName,
  resolvePath,
  type EmitContext,
  type Model,
} from "@typespec/compiler";
import { buildAvroRecord } from "./walk/model.js";
import { listRecords } from "./decorators/record.js";
import { reportDiagnostic, type AvroEmitterOptions } from "./lib.js";
import { renderAvroFile } from "./render.js";
import type { AvroRecord } from "./types.js";

/**
 * The path of the file that holds one record.
 *
 * The namespace becomes directories, which is how the Avro tools and the
 * Java code generator lay a schema tree out.
 *
 * @param outputDir - The output dir
 * @param schema - The schema object under construction
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

  // The path a record takes is claimed by that record. Two records under one
  // Avro namespace can carry one name, because two TypeSpec namespaces can
  // carry one Avro namespace. Writing both would leave one file holding the
  // second schema, and the first record would be gone without a word.
  const claimed = new Map<string, Model>();

  const files: { path: string; text: string }[] = [];
  for (const model of listRecords(program)) {
    const schema = buildAvroRecord(program, model);
    if (schema === undefined) {
      continue;
    }

    const path = pathOf(context.emitterOutputDir, schema);
    const owner = claimed.get(path);
    if (owner !== undefined) {
      reportDiagnostic(program, {
        code: "duplicate-record",
        format: { name: getTypeName(model), other: getTypeName(owner), path },
        target: model,
      });
      continue;
    }
    claimed.set(path, model);

    files.push({ path, text: renderAvroFile(schema) });
  }

  if (program.compilerOptions.dryRun === true || program.hasError()) {
    return;
  }

  for (const file of files) {
    await program.host.mkdirp(getDirectoryPath(file.path));
    await program.host.writeFile(file.path, file.text);
  }
}
