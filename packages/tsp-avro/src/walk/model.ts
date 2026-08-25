/**
 * The walk: a TypeSpec type becomes an Avro schema.
 *
 * Two things make this different from the Protobuf walk next door.
 *
 * An Avro schema is one self contained JSON document. There is no import, so
 * every named type a record reaches is written into that record's own file.
 * Avro writes a named type in full the first time it appears, and by name
 * afterwards, so the walk remembers the full names it has already written.
 * Recursion falls out of that rule rather than needing one of its own: a name
 * is remembered before its fields are walked, so a field that reaches back to
 * the type it is inside finds the name already there.
 *
 * Avro has no optional field and no nullable type. Both are one thing there: a
 * union with null. So an optional property and a property default are decided
 * together, because a default has to match the first branch of the union it
 * sits in, and that is what settles the order of the branches.
 *
 * A construct with no Avro form is refused, and the whole record is dropped.
 * Nothing is guessed and nothing is written half translated, because a half
 * translated schema is still a valid schema, and a schema registry would take
 * it.
 */

import {
  getDoc,
  getTypeName,
  isArrayModelType,
  isRecordModelType,
  isTemplateInstance,
  serializeValueAsJson,
  UnserializableValueError,
  type DiagnosticTarget,
  type Enum,
  type Model,
  type ModelProperty,
  type Program,
  type Type,
  type Union,
  type Value,
} from "@typespec/compiler";
import { isAvroName } from "../decorators/names.js";
import { resolveAvroNamespace } from "../decorators/namespace.js";
import { reportDiagnostic } from "../lib.js";
import {
  isAvroUnion,
  type AvroBranch,
  type AvroDefault,
  type AvroField,
  type AvroRecord,
  type AvroSchema,
  type AvroUnion,
} from "../types.js";
import { avroScalarFor, createScalarTable, type AvroScalarTable } from "./scalars.js";

/**
 * What the walk carries from one type to the next.
 *
 * `defined` maps every full name already written into the file being built to
 * the declaration that took it. It is per file, because each file stands
 * alone. The declaration is kept, not just the name: two TypeSpec declarations
 * can resolve to one Avro name, and a name alone cannot tell that apart from a
 * second visit to the same declaration.
 *
 * `refused` is set once and never cleared: the walk keeps going after a
 * refusal so the author sees every problem in one compile, and the caller
 * drops the record at the end.
 */
interface WalkContext {
  readonly program: Program;
  readonly scalars: AvroScalarTable;
  readonly defined: Map<string, Model | Enum>;
  refused: boolean;
}

/**
 * Builds the Avro schema of one model marked with `@record`.
 *
 * @param program - The program the model belongs to
 * @param model - The marked model
 * @returns The schema, or undefined when the walk refused any part of it
 *
 * @internal
 */
export function buildAvroRecord(program: Program, model: Model): AvroRecord | undefined {
  const context: WalkContext = {
    program,
    scalars: createScalarTable(program),
    defined: new Map(),
    refused: false,
  };

  const schema = namedModelFor(context, model, model);

  if (context.refused || typeof schema === "string") {
    return undefined;
  }
  return schema;
}

/**
 * Records that the walk refused something.
 *
 * The caller reports why, calls this, and returns undefined. The record it is
 * building is dropped at the end.
 */
function markRefused(context: WalkContext): void {
  context.refused = true;
}

/**
 * Translates one type into a schema.
 */
function typeFor(
  context: WalkContext,
  type: Type,
  target: DiagnosticTarget,
): AvroSchema | undefined {
  switch (type.kind) {
    case "Scalar": {
      const primitive = avroScalarFor(context.scalars, type);
      if (primitive === undefined) {
        reportDiagnostic(context.program, {
          code: "unsupported-type",
          messageId: "scalar",
          format: { name: type.name },
          target,
        });
        markRefused(context);
        return undefined;
      }
      return primitive;
    }
    case "Model":
      return modelFor(context, type, target);
    case "Enum":
      return enumFor(context, type, target);
    case "Union":
      return unionFor(context, type, target);
    case "Intrinsic":
      if (type.name === "null") {
        return "null";
      }
      reportDiagnostic(context.program, {
        code: "unsupported-type",
        messageId: "intrinsic",
        format: { name: type.name },
        target,
      });
      markRefused(context);
      return undefined;
    default:
      reportDiagnostic(context.program, {
        code: "unsupported-type",
        format: { kind: type.kind },
        target,
      });
      markRefused(context);
      return undefined;
  }
}

/**
 * Translates a model, which is a record, an array or a map.
 *
 * TypeSpec spells an array as `T[]` and a map as `Record<T>`, and both are
 * models. Avro spells them as types of their own, and neither is named, so
 * neither takes part in the first occurrence rule.
 */
function modelFor(
  context: WalkContext,
  model: Model,
  target: DiagnosticTarget,
): AvroSchema | undefined {
  if (isArrayModelType(model)) {
    const items = typeFor(context, model.indexer.value, target);
    return items === undefined ? undefined : { type: "array", items };
  }

  // A model that spreads `Record<T>` answers yes to `isRecordModelType` as
  // well, and it also has fields of its own. Writing it as a map would drop
  // every one of them without a word. So only a model with nothing but the
  // index signature is a map. The rest fall through, and the check further
  // down refuses them.
  if (isRecordModelType(model) && model.properties.size === 0) {
    const values = typeFor(context, model.indexer.value, target);
    return values === undefined ? undefined : { type: "map", values };
  }

  return namedModelFor(context, model, target);
}

/**
 * Translates a named model into a record, or into a reference to one.
 */
function namedModelFor(
  context: WalkContext,
  model: Model,
  target: DiagnosticTarget,
): AvroRecord | string | undefined {
  if (model.name === "") {
    reportDiagnostic(context.program, { code: "unsupported-type", messageId: "anonymous", target });
    markRefused(context);
    return undefined;
  }
  if (model.baseModel) {
    reportDiagnostic(context.program, {
      code: "unsupported-type",
      messageId: "inheritance",
      format: { name: model.name },
      target: model,
    });
    markRefused(context);
    return undefined;
  }

  if (isTemplateInstance(model)) {
    // `Box<string>` and `Box<int32>` are both named `Box`. Avro names a type
    // once per schema, so the second one would come out as a reference to the
    // first, and it would mean something the author did not write.
    reportDiagnostic(context.program, {
      code: "unsupported-type",
      messageId: "template",
      format: { name: model.name },
      target: model,
    });
    markRefused(context);
    return undefined;
  }
  if (model.indexer !== undefined) {
    // A model that spreads `Record<T>` carries an index signature. An Avro
    // record has fields alone, so those values have nowhere to go.
    reportDiagnostic(context.program, {
      code: "unsupported-type",
      messageId: "indexer",
      format: { name: model.name },
      target: model,
    });
    markRefused(context);
    return undefined;
  }

  const fullName = fullNameOf(context, model, model.name, target);
  if (fullName === undefined) {
    return undefined;
  }
  const taken = defineName(context, fullName, model, target);
  if (taken === false) {
    return undefined;
  }
  if (taken === "again") {
    return fullName;
  }

  const fields: AvroField[] = [];
  for (const property of model.properties.values()) {
    const field = fieldFor(context, property);
    if (field !== undefined) {
      fields.push(field);
    }
  }

  return {
    type: "record",
    name: model.name,
    namespace: namespaceOf(fullName),
    doc: getDoc(context.program, model),
    fields,
  };
}

/**
 * Translates a union into a flat Avro union.
 *
 * Avro states two rules and this holds both. A union may not hold another
 * union, so a nested one is flattened into the outer one. And a union may not
 * name one type twice, so a repeated branch is refused.
 *
 * Flattening never fails, because a nested union always opens up. What fails
 * is the rule underneath it: `(string | int32) | string` flattens to three
 * branches, and two of them are `string`.
 */
function unionFor(context: WalkContext, union: Union, target: DiagnosticTarget): AvroUnion {
  const branches: AvroBranch[] = [];
  const keys = new Set<string>();

  for (const variant of union.variants.values()) {
    const schema = typeFor(context, variant.type, target);
    if (schema !== undefined) {
      addBranch(context, branches, keys, schema, target);
    }
  }

  return branches;
}

/**
 * Adds one translated variant to a union, flattening it and refusing a repeat.
 */
function addBranch(
  context: WalkContext,
  branches: AvroBranch[],
  keys: Set<string>,
  schema: AvroSchema,
  target: DiagnosticTarget,
): void {
  if (isAvroUnion(schema)) {
    for (const inner of schema) {
      addBranch(context, branches, keys, inner, target);
    }
    return;
  }

  const key = branchKey(schema);
  if (keys.has(key)) {
    reportDiagnostic(context.program, {
      code: "duplicate-union-branch",
      format: { name: key },
      target,
    });
    markRefused(context);
    return;
  }

  keys.add(key);
  branches.push(schema);
}

/**
 * The name Avro knows a branch by.
 *
 * Two branches clash when this is the same. A named type is compared by its
 * full name, and everything else by its type name: Avro holds one array and
 * one map in a union, whatever they carry, because a reader tells the branches
 * apart by type alone.
 */
function branchKey(schema: AvroBranch): string {
  if (typeof schema === "string") {
    return schema;
  }
  switch (schema.type) {
    case "record":
    case "enum":
      return schema.namespace === undefined ? schema.name : `${schema.namespace}.${schema.name}`;
    case "array":
    case "map":
      return schema.type;
  }
}

/**
 * Translates one model property into a field.
 *
 * Avro has no optional field. A property that may be absent becomes a union
 * with null, and the default that goes with it is null. A property default is
 * written as it stands, and it decides the order of the branches: Avro reads a
 * default against the first branch of a union and against no other, so the
 * branch the default belongs to has to lead.
 *
 * | TypeSpec           | Avro                               |
 * | ------------------ | ---------------------------------- |
 * | `x: string`        | `"string"`                         |
 * | `x?: string`       | `["null", "string"]`, default null  |
 * | `x: string = "a"`  | `"string"`, default "a"            |
 * | `x?: string = "a"` | `["string", "null"]`, default "a"  |
 *
 * A field with no default orders nothing. Nothing has to lead there, and the
 * position of a branch is its index on the wire, so the order the author wrote
 * stands.
 */
function fieldFor(context: WalkContext, property: ModelProperty): AvroField | undefined {
  if (!isAvroName(property.name)) {
    reportDiagnostic(context.program, {
      code: "invalid-name",
      format: { name: property.name },
      target: property,
    });
    markRefused(context);
    return undefined;
  }

  const declared = typeFor(context, property.type, property);
  if (declared === undefined) {
    return undefined;
  }

  const doc = getDoc(context.program, property);

  const branches: AvroBranch[] = isAvroUnion(declared) ? [...declared] : [declared];
  if (property.optional && !branches.includes("null")) {
    branches.push("null");
  }

  // A field carries a default when the author wrote one, and when the field is
  // optional. Nothing else does: a union with null is legal without a default,
  // and Avro asks for one only where a reader has to fill the field in.
  const written = property.defaultValue;
  if (written === undefined && !property.optional) {
    return { name: property.name, type: schemaOf(branches), doc };
  }

  const value = written === undefined ? { value: null } : defaultOf(context, property, written);
  if (value === undefined) {
    return undefined;
  }

  const ordered = leadWithDefault(context, property, branches, written);
  if (ordered === undefined) {
    return undefined;
  }

  return { name: property.name, type: schemaOf(ordered), doc, default: value.value };
}

/**
 * Reads a property default as the JSON value Avro writes.
 *
 * The compiler hands a default over as `unknown`. It is assignable to the
 * property type, and every type this walk accepts turns into a JSON value, so
 * this is the one place the shape is narrowed.
 *
 * Two answers are not values. The compiler throws where a value has no JSON
 * form, and it answers with nothing where a numeric fits no double. Neither is
 * a default, and null is not a stand in for either: null is a legal Avro
 * default, so taking the answer would write a field the author never asked
 * for.
 *
 * @returns The value in a wrapper, so a default of null is not the refusal,
 *   or undefined when the default was refused
 */
function defaultOf(
  context: WalkContext,
  property: ModelProperty,
  written: Value,
): { value: AvroDefault } | undefined {
  let serialized: unknown;
  try {
    serialized = serializeValueAsJson(context.program, written, property);
  } catch (error) {
    if (!(error instanceof UnserializableValueError)) {
      throw error;
    }
    refuseDefault(context, property, error.message);
    return undefined;
  }

  if (serialized === undefined || (serialized === null && written.valueKind !== "NullValue")) {
    refuseDefault(
      context,
      property,
      "The compiler had no JSON value for it. A number no double holds is one cause.",
    );
    return undefined;
  }
  return { value: serialized as AvroDefault };
}

/**
 * Reports a default the emitter cannot write, and refuses the record.
 */
function refuseDefault(context: WalkContext, property: ModelProperty, detail: string): void {
  reportDiagnostic(context.program, {
    code: "invalid-default",
    messageId: "unserializable",
    format: { name: property.name, detail },
    target: property,
  });
  markRefused(context);
}

/**
 * Puts the branch the default belongs to at the front of a union.
 *
 * Avro reads the default of a field against the first branch and against no
 * other. So the branch that carries the default leads, and the rest keep the
 * order the author gave them.
 *
 * A default that belongs to no branch is refused. It has no place to sit, and
 * a union that led with any other branch would describe a default the author
 * never wrote.
 *
 * @param branches - The flattened branches
 * @param written - The default the author wrote, or undefined when the field
 *   is optional and defaults to null
 * @returns The branches in that order, or undefined when the default was
 *   refused
 */
function leadWithDefault(
  context: WalkContext,
  property: ModelProperty,
  branches: AvroBranch[],
  written: Value | undefined,
): AvroBranch[] | undefined {
  if (branches.length === 1) {
    return branches;
  }

  const key = written === undefined ? "null" : defaultBranchKey(context, written);
  const index = key === undefined ? -1 : branches.findIndex((one) => branchKey(one) === key);
  if (index < 0) {
    reportDiagnostic(context.program, {
      code: "invalid-default",
      messageId: "branch",
      format: { name: property.name },
      target: property,
    });
    markRefused(context);
    return undefined;
  }

  return [branches[index], ...branches.slice(0, index), ...branches.slice(index + 1)];
}

/**
 * The union branch a written default belongs to, as {@link branchKey} spells
 * it.
 *
 * The value carries the answer, not the property type: `string | int32 = 3`
 * has a union for its type, and the checker has already settled that the 3 is
 * an `int32`.
 *
 * A model literal settles nothing. Its type is the whole union, so two record
 * branches are both candidates and nothing tells them apart. That is undefined
 * here, and the caller refuses it.
 *
 * @returns The key, or undefined when the value names no one branch
 */
function defaultBranchKey(context: WalkContext, written: Value): string | undefined {
  switch (written.valueKind) {
    case "NullValue":
      return "null";
    case "BooleanValue":
    case "NumericValue":
    case "StringValue":
      return written.scalar === undefined
        ? undefined
        : avroScalarFor(context.scalars, written.scalar);
    case "EnumValue":
      // The enum was walked on the way here, so its full name is already the
      // name of a branch. Reading it back is what keeps the two spellings one.
      return definedNameOf(context, written.value.enum);
    default:
      return undefined;
  }
}

/**
 * Finds the full name a declaration took in the file being built.
 */
function definedNameOf(context: WalkContext, declaration: Model | Enum): string | undefined {
  for (const [fullName, owner] of context.defined) {
    if (owner === declaration) {
      return fullName;
    }
  }
  return undefined;
}

/**
 * Writes a list of branches as a schema.
 *
 * Avro spells a union of one as the type itself, not as an array of one.
 */
function schemaOf(branches: AvroBranch[]): AvroSchema {
  return branches.length === 1 ? branches[0] : branches;
}

/**
 * Translates an enum into an Avro enum, or into a reference to one.
 *
 * An Avro enum holds symbols and nothing else. A TypeSpec member that carries
 * a value of its own is refused, because that value has nowhere to go.
 */
function enumFor(
  context: WalkContext,
  target: Enum,
  source: DiagnosticTarget,
): AvroSchema | undefined {
  const fullName = fullNameOf(context, target, target.name, source);
  if (fullName === undefined) {
    return undefined;
  }
  const taken = defineName(context, fullName, target, source);
  if (taken === false) {
    return undefined;
  }
  if (taken === "again") {
    return fullName;
  }

  const symbols: string[] = [];
  for (const member of target.members.values()) {
    if (!isAvroName(member.name)) {
      reportDiagnostic(context.program, {
        code: "invalid-name",
        format: { name: member.name },
        target: member,
      });
      markRefused(context);
      continue;
    }
    if (member.value !== undefined && member.value !== member.name) {
      reportDiagnostic(context.program, {
        code: "enum-member-value",
        format: { name: member.name },
        target: member,
      });
      markRefused(context);
      continue;
    }
    symbols.push(member.name);
  }

  return {
    type: "enum",
    name: target.name,
    namespace: namespaceOf(fullName),
    doc: getDoc(context.program, target),
    symbols,
  };
}

/**
 * Claims a full name for one declaration inside the file being built.
 *
 * The name is claimed before the fields are walked. That is what makes a type
 * that reaches itself end in a name rather than in another copy.
 *
 * A name is claimed by one declaration. A second declaration that resolves to
 * the same name is refused, because writing it as a reference would give it
 * the fields of the first, which the author never wrote. Two TypeSpec
 * namespaces may carry the same Avro namespace, so this needs no template to
 * happen.
 *
 * @returns "first" to write the definition, "again" to write the name, or
 *   false when the name belongs to another declaration
 */
function defineName(
  context: WalkContext,
  fullName: string,
  declaration: Model | Enum,
  target: DiagnosticTarget,
): "first" | "again" | false {
  const owner = context.defined.get(fullName);
  if (owner === declaration) {
    return "again";
  }
  if (owner !== undefined) {
    reportDiagnostic(context.program, {
      code: "unsupported-type",
      messageId: "duplicate",
      format: {
        name: getTypeName(declaration),
        other: getTypeName(owner),
        fullName,
      },
      target,
    });
    markRefused(context);
    return false;
  }

  context.defined.set(fullName, declaration);
  return "first";
}

/**
 * Builds the Avro full name of a named type, and refuses what Avro cannot
 * name.
 */
function fullNameOf(
  context: WalkContext,
  type: Model | Enum,
  name: string,
  target: DiagnosticTarget,
): string | undefined {
  if (!isAvroName(name)) {
    reportDiagnostic(context.program, { code: "invalid-name", format: { name }, target });
    markRefused(context);
    return undefined;
  }

  const namespace = resolveAvroNamespace(context.program, type);
  if (namespace === undefined) {
    reportDiagnostic(context.program, { code: "namespace-required", target: type });
    markRefused(context);
    return undefined;
  }

  return `${namespace}.${name}`;
}

/**
 * Splits the namespace back off a full name.
 */
function namespaceOf(fullName: string): string {
  return fullName.slice(0, fullName.lastIndexOf("."));
}
