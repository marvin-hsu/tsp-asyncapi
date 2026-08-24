import { EmitContext, emitFile, resolvePath, listServices, Service } from "@typespec/compiler";
import { reportDiagnostic } from "tsp-asyncapi-core";
import type { AsyncAPIEmitterOptions } from "./emitter-options.js";
import { buildAsyncAPIDocument } from "./pipeline.js";
import { reportUnavailablePreviewFeatures } from "./preview-features.js";
import {
  availableFeatures,
  collectSchemaArtifacts,
  shippedProviders,
} from "./schema-artifacts/provider.js";
import yaml from "yaml";

/**
 * The main entry point for the AsyncAPI emitter.
 * The TypeSpec compiler calls this function automatically when `--emit tsp-asyncapi` is specified.
 *
 * It performs the following steps:
 * 1. Generates the AsyncAPI 3.1 document object tree.
 * 2. Serializes it to YAML or JSON based on emitter options.
 * 3. Writes the output file to the disk.
 *
 * @param context - Context containing the program and emitter options.
 * @public
 */
export async function $onEmit(context: EmitContext<AsyncAPIEmitterOptions>) {
  const options = context.options;
  const program = context.program;

  const providers = shippedProviders(context.perf);

  // A requested feature with no provider behind it is refused. A document
  // written now would ignore the request without saying so, so nothing is
  // written.
  if (reportUnavailablePreviewFeatures(program, options, availableFeatures(providers))) return;

  // Every provider a preview feature turns on runs here, before resolve. A
  // provider runs another emitter, and it reads `program.hasError()`, so this
  // stays ahead of every diagnostic the stages below report.
  const collected = await collectSchemaArtifacts(
    program,
    new Set(options["preview-features"] ?? []),
    providers,
  );

  const services = listServices(program);
  let service: Service | undefined = undefined;
  if (services.length > 0) {
    service = services[0];
    if (services.length > 1) {
      reportDiagnostic(program, {
        code: "multiple-services",
        target: services[1].type,
      });
    }
  }

  // A conflict removes both artifacts, so the models it hit fall back to the
  // schema their TypeSpec type produces. That document answers the request
  // with output that ignores it, which is the same reason nothing is written
  // for a feature this release cannot honor.
  if (collected.refused) return;

  const doc = await buildAsyncAPIDocument(program, service, options, collected.artifacts);

  // Default serialization
  const fileType = options["file-type"] ?? "yaml";
  const defaultFilename = fileType === "json" ? "asyncapi.json" : "asyncapi.yaml";
  const filename = options["output-file"] ?? defaultFilename;

  let outputContent: string;
  if (fileType === "json") {
    outputContent = JSON.stringify(doc, null, 2);
  } else {
    // `lineWidth: 0` turns line wrapping off. The default width of 80 folds
    // a long scalar such as a `$ref` across two lines. A folded `$ref` is
    // legal YAML, but a plain-text search for the pointer no longer finds it.
    outputContent = yaml.stringify(doc, { lineWidth: 0 });
  }

  if (!context.program.compilerOptions.noEmit) {
    const outPath = resolvePath(context.emitterOutputDir, filename);
    await emitFile(program, {
      path: outPath,
      content: outputContent,
    });
  }
}
