/**
 * Reads the decorator state the Avro library records on a model.
 *
 * A linter rule asks one question: does the author mark this model as an
 * Avro record? The answer decides whether a message naming an Avro media
 * type actually has an Avro payload.
 *
 * This file answers that question without a dependency on `tsp-avro`, so
 * this package stays installable on its own. The compiler builds every
 * state symbol with `Symbol.for` from the library name and the key, so the
 * same symbol comes back from the global registry either way.
 *
 * The key name and its shape carry no compatibility promise from that
 * library. This file is the only place that reads them, so an upgrade has
 * one place to check.
 */

import type { Model, Program } from "@typespec/compiler";

/** The state key of `@Avro.avroRecord`, a set of the models that carry it. */
const RECORD_STATE = Symbol.for("tsp-avro.record");

/**
 * Lists every model the author marked with `@Avro.avroRecord`.
 *
 * These are the models the Avro preview feature can render a payload for.
 * A model the Avro emitter writes for another reason, such as one another
 * record reaches, has no schema file of its own and so no AsyncAPI payload
 * either.
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
