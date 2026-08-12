/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-deprecated */
import { resolvePath } from "@typespec/compiler";
import {
  createTestLibrary,
  findTestPackageRoot,
  createTestHost,
  createTestWrapper,
  StandardTestLibrary,
} from "@typespec/compiler/testing";
import { fileURLToPath } from "url";

/**
 * @category Testing
 * @public
 */
export const AsyncAPITestLibrary = createTestLibrary({
  name: "typespec-asyncapi",
  packageRoot: await findTestPackageRoot(import.meta.url),
});

/**
 * @category Testing
 * @public
 */
export async function createAsyncAPITestHost() {
  return createTestHost({
    libraries: [AsyncAPITestLibrary, StandardTestLibrary],
  });
}

/**
 * @category Testing
 * @public
 */
export async function createAsyncAPITestRunner() {
  const host = await createAsyncAPITestHost();
  const runner = createTestWrapper(host, {
    autoImports: ["typespec-asyncapi"],
    autoUsings: ["AsyncAPI"],
    compilerOptions: {
      noEmit: false,
      emit: ["typespec-asyncapi"],
    },
  });
  return { host, runner };
}
