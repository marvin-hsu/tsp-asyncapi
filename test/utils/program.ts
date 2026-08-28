import type { Program } from "@typespec/compiler";

/**
 * A program the code under test is not allowed to read.
 *
 * Some units take a `Program` and forward it without reading it. The
 * assembly of the document is one: it hands the program to the schema
 * builder, and a model that declares no schema never reaches that builder.
 * Compiling a real program for such a case costs seconds and proves
 * nothing.
 *
 * Three test files each wrote `{} as unknown as Program` for this, and each
 * of them stated the claim in a comment. This states the same claim as a
 * check. Every read of a named member throws, so a unit that starts reading
 * the program fails the case that assumed it would not.
 *
 * A symbol read answers `undefined` instead. A failure report inspects the
 * value through `Symbol.toStringTag` and the inspector of the runtime, and
 * a throw from there would hide the real failure.
 *
 * @returns A program that refuses to be read
 */
export function unusedProgram(): Program {
  const refusing = new Proxy(
    {},
    {
      get(_target, key): undefined {
        if (typeof key === "symbol") return undefined;
        throw new Error(
          `This case passes a program nothing may read, and the code under test read '${key}'.`,
        );
      },
    },
  );
  // The one cast, in the one place. A `Program` has a hundred members and
  // this object answers none of them, which is the whole point.
  return refusing as Program;
}
