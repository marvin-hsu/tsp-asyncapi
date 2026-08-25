/**
 * The entry point of the Avro emitter.
 *
 * The TypeSpec compiler calls this function when a project asks for
 * `--emit tsp-avro`.
 *
 * It writes no file yet, and it reads nothing, so it takes no argument. The
 * walk that turns a TypeSpec model into an Avro schema is not implemented, and
 * nothing marks a model for output, so a file written now would hold nothing.
 * The emit context arrives with the walk that needs it.
 *
 * A dry run and a failed compilation must both produce no file. That check
 * arrives with the write it suppresses. Written today it would guard nothing,
 * and no test could tell it from its absence: the compiler skips an emitter
 * once the program has an error, and there is no write for either condition to
 * stop.
 *
 * @public
 */
export function $onEmit(): void {
  // The walk lands here next.
}
