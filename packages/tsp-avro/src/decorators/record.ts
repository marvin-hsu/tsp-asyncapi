/**
 * The `@record` decorator and its readers.
 *
 * Marking a model here is what makes the emitter write it as one `.avsc`
 * file. This file only records the mark and lists the marked models in
 * source order. The emitter decides the file path, and the walk decides
 * whether the model translates.
 */

import { DecoratorContext, Model, Program } from "@typespec/compiler";
import { useStateSet } from "@typespec/compiler/utils";

const recordStateKey = Symbol.for("tsp-avro.record");

const [isRecordInternal, markRecord] = useStateSet<Model>(recordStateKey);

/**
 * Marks a model as an Avro record to emit.
 *
 * One marked model becomes one `.avsc` file. A model this one reaches is
 * written into that same file, because an Avro schema holds no import and has
 * to stand alone. Mark a model here only when you want a file for it.
 *
 * @param context - The decorator context
 * @param target - The model to emit
 *
 * @example
 * ```typespec
 * @record
 * model OrderPlaced { id: string; }
 * ```
 *
 * @public
 */
export function $record(context: DecoratorContext, target: Model): void {
  markRecord(context.program, target);
}

/**
 * Tells whether `@record` marks this model.
 *
 * @param program - The program to read the state from
 * @param target - The model to test
 *
 * @returns True when the decorator was applied to `target`
 *
 * @public
 */
export function isRecord(program: Program, target: Model): boolean {
  return isRecordInternal(program, target);
}

/**
 * Lists every model marked with `@record`, in the order the marks were made.
 *
 * That order is the order the decorators ran, which is source order. The
 * emitter writes one file per entry, so the order decides nothing about the
 * output beyond which file is written first.
 *
 * @param program - The program to read the state from
 *
 * @returns The marked models
 *
 * @public
 */
export function listRecords(program: Program): Model[] {
  return [...(program.stateSet(recordStateKey) as Set<Model>)];
}
