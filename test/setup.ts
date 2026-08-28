import { expect } from "vitest";
import { validateAsyncAPI } from "./utils/spec-validation.js";

/**
 * Matchers for the official AsyncAPI parser.
 *
 * A throwing helper hides the assertion: neither a reader nor a static
 * analyser can tell what the test checks. A matcher keeps the assertion at
 * the call site and hands the failure message to vitest.
 */
expect.extend({
  async toBeValidAsyncAPI(received: unknown) {
    const failure = await validateAsyncAPI(received);
    return {
      pass: failure === null,
      message: () =>
        failure ?? "Expected the AsyncAPI parser to reject this document, but it accepted it.",
    };
  },

  /**
   * Asserts the parser rejects the document for the given reason.
   *
   * `.not.toBeValidAsyncAPI()` cannot say why a document is invalid, so it
   * would pass on any rejection, including one for the wrong reason.
   */
  async toBeInvalidAsyncAPI(received: unknown, reason: RegExp) {
    const failure = await validateAsyncAPI(received);

    if (failure === null) {
      return {
        pass: false,
        message: () =>
          `Expected the AsyncAPI parser to reject this document with ${reason.toString()}, ` +
          `but it accepted it.`,
      };
    }

    return {
      pass: reason.test(failure),
      message: () =>
        `Expected the rejection to match ${reason.toString()}, but it was:\n${failure}`,
    };
  },
});

declare module "vitest" {
  // The type parameter has to match vitest's own declaration exactly, `any`
  // default included. TypeScript rejects an augmentation whose parameters
  // differ, even when the difference is a stricter default.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Matchers<T = any> {
    /** Passes when the official parser accepts the document as AsyncAPI 3.x. */
    toBeValidAsyncAPI: () => Promise<T>;
    /** Passes when the official parser rejects the document for `reason`. */
    toBeInvalidAsyncAPI: (reason: RegExp) => Promise<T>;
  }
}
