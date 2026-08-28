import type { Program } from "@typespec/compiler";

/**
 * A program the code under test is not allowed to read.
 *
 * Some units take a `Program` and forward it without reading it. The
 * document assembly is one: it hands the program to the schema builder,
 * and a model with no schema never reaches that builder. Compiling a real
 * program for such a case costs seconds and proves nothing.
 *
 * Every read of a named member throws, so a unit that starts reading the
 * program fails the case that assumed it would not. A symbol read answers
 * `undefined` instead, because a failure report inspects the value through
 * `Symbol.toStringTag` and the runtime inspector, and a throw from there
 * would hide the real failure.
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
  // The one cast, in the one place: this object answers none of a
  // `Program`'s many members, which is the whole point.
  return refusing as Program;
}
