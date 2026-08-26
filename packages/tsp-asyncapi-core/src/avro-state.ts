/**
 * Reading the decorator state of the Avro library.
 *
 * A linter rule asks one question about a model: does the author mark it as an
 * Avro record? The answer decides whether a message that names an Avro media
 * type has an Avro payload to go with it.
 *
 * The question is answered here, without a dependency on `tsp-avro`. This
 * package owns the input language and must stay installable on its own, and a
 * rule that only asks a yes or no question does not need the library that
 * answers it. The compiler builds every state symbol with `Symbol.for`, from
 * the library name and the key, so the same symbol comes back from the global
 * registry.
 *
 * The key name and the shape behind it are not covered by any compatibility
 * promise of that library. This file is the only place that reads them, so an
 * upgrade has one place to check.
 */

import type { Model, Program } from "@typespec/compiler";

/** The state key of `@Avro.avroRecord`, a set of the models that carry it. */
const RECORD_STATE = Symbol.for("tsp-avro.record");

/**
 * Lists every model the author marked with `@Avro.avroRecord`.
 *
 * These are the models the Avro preview feature offers a generated payload
 * for. A model the Avro emitter writes for another reason, such as one another
 * record reaches, is not one of them. Such a model has no schema file of its
 * own, so it has no AsyncAPI payload of its own either.
 *
 * @param program - The compiled program
 * @returns Every model that carries the decorator
 * @internal
 */
export function listAvroRecordModels(program: Program): Model[] {
  const models: Model[] = [];
  for (const type of program.stateSet(RECORD_STATE)) {
    // The decorator only accepts a model, so every entry is one.
    if (type.kind === "Model") models.push(type);
  }
  return models;
}
