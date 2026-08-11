import { EmitContext, emitFile, resolvePath } from "@typespec/compiler";

/**
 * Options for the AsyncAPI Emitter.
 * @category Configuration
 * @public
 */
export interface AsyncAPIEmitterOptions {
  "output-file"?: string;
}

/**
 * Emits the AsyncAPI document.
 * @category Core Emitter
 * @public
 */
export async function $onEmit(context: EmitContext<AsyncAPIEmitterOptions>) {
  const emitterOptions = context.options;

  // Create a minimal AsyncAPI spec as a placeholder
  const asyncApiDocument = {
    asyncapi: "2.6.0",
    info: {
      title: "AsyncAPI Document",
      version: "1.0.0",
    },
    channels: {},
  };

  const outputFileName = emitterOptions["output-file"] ?? "asyncapi.yaml";
  const outPath = resolvePath(context.emitterOutputDir, outputFileName);

  const content = JSON.stringify(asyncApiDocument, null, 2);

  if (!context.program.compilerOptions.noEmit) {
    await emitFile(context.program, {
      path: outPath,
      content,
    });
  }
}
