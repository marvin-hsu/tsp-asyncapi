/**
 * The `parameters` map of one channel, and the mismatches between its
 * address and its operations.
 *
 * It reads the channel's address and every top-level parameter its
 * operations declare, setting aside a parameter whose type carries
 * `@message`, since that one declares a message instead of an address piece.
 *
 * It decides which address expression has no declaration, which declaration
 * the address never uses, and which declarations of one name disagree, and
 * reports each mistake. It builds the Parameter Object for every name the
 * address holds.
 *
 * The lower half turns each Parameter Object into a document entry. This
 * module names no schema and expands nothing; it only decides what belongs
 * in the map and what each entry contains.
 */

import {
  Enum,
  Model,
  ModelProperty,
  Program,
  Scalar,
  Type,
  Union,
  getDoc,
} from "@typespec/compiler";
import { isGlobalTypeSpecNamespace } from "../../constants.js";
import { parseAddressParameters } from "../../decorators/channels/address-template.js";
import { ChannelParameterNode } from "../service.js";
import { ChannelRecord, ChannelTarget } from "../../decorators/channels/state.js";
import { getParameterLocation } from "../../decorators/index.js";
import { reportDiagnostic } from "../../lib.js";
import { serializeExamples } from "../../example-serialization.js";
import { present, text } from "../../optional-fields.js";
import { unwrapModels } from "../operation-models.js";
import { channelOperations } from "./scope.js";

/**
 * Builds the `parameters` map of one channel, and reports every mistake in
 * the way its address and its operations line up.
 *
 * A channel parameter is declared by a top-level parameter of an operation
 * the channel owns. A parameter whose type carries `@message` is a message
 * declaration instead, so it takes no part in the matching in either
 * direction.
 *
 * The matching runs both ways. An expression in the address with no
 * declaration is reported, because AsyncAPI requires the `parameters` map to
 * cover the whole address. A declaration the address never uses is reported
 * too. This emitter never rewrites an address to absorb a stray parameter,
 * unlike the HTTP library's default route producer, because the author wrote
 * the address by hand and it is the address the document must carry.
 *
 * The field is emitted only when the address holds at least one expression.
 * A channel with a plain address never gets it, and a dynamic channel never
 * gets it either, because it has no address to put an expression in.
 *
 * A dynamic channel is left out of the matching altogether. It has no
 * address, so no declaration can be matched against one, and no expression
 * can be missing a declaration.
 *
 * @param program - The program to report on
 * @param target - The interface or namespace that carries the channel
 * @param record - The recorded channel, for its address and address target
 * @param channelId - The key of this channel, for the messages below
 * @param messageModels - Every model the program marks with `@message`. The
 * answer is the same for every channel, so the caller builds the set once.
 * @returns The `parameters` map, or `undefined` when the address holds no
 * expression
 */
export function resolveChannelParameters(
  program: Program,
  target: ChannelTarget,
  record: ChannelRecord,
  channelId: string,
  messageModels: ReadonlySet<Model>,
): readonly ChannelParameterNode[] {
  const address = record.state.address;
  // A dynamic channel carries no address, so neither direction of the match
  // applies to it. Every check below would name an address the channel does
  // not have, and the fix each one asks for would be impossible to write.
  if (address === null) return [];

  // One name written twice in an address is one parameter. The duplicate is
  // taken out here, so nothing below reports the same mistake twice.
  const names = [...new Set(parseAddressParameters(address))];
  const readFields = parameterFieldReader(program);
  const declared = collectDeclarations(program, target, channelId, readFields, messageModels);

  reportAddressMismatch(program, record, channelId, names, declared);

  if (names.length === 0) return [];
  return names.map((name) =>
    describeParameter(program, name, declared.get(name), readFields, target),
  );
}

/**
 * Everything one declaration contributes to a Parameter Object.
 *
 * The five fields are read from the declaration once, and everything below
 * works on this record rather than on the declaration itself. Two jobs need
 * the same five values: comparing two declarations of one name, and emitting
 * the winner. Reading them once keeps the two jobs in step, so a field this
 * emitter starts to emit cannot be left out of the comparison.
 */
interface ParameterFields {
  /**
   * The values the declared type allows. It is an empty array when the type
   * is a string with no limited set. It is `undefined` when the type is not
   * a string type at all.
   */
  values: string[] | undefined;
  default: string | undefined;
  description: string | undefined;
  examples: string[] | undefined;
  location: string | undefined;
}

/** Reads the fields of one declaration, and reads each declaration once. */
type ParameterFieldReader = (property: ModelProperty) => ParameterFields;

/**
 * Builds a reader that keeps what it has already read.
 *
 * One declaration is read twice. It is read to compare it with another
 * declaration of the same name, and it is read again to emit it. Reading it
 * reports the diagnostic of an example that cannot be serialized. So a
 * second read would report that one mistake a second time. The cache lives
 * for one channel, so nothing is carried between channels or between emits.
 */
function parameterFieldReader(program: Program): ParameterFieldReader {
  const read = new Map<ModelProperty, ParameterFields>();
  return (property) => {
    const known = read.get(property);
    if (known !== undefined) return known;
    const fields: ParameterFields = {
      values: stringValuesOf(program, property.type),
      default: defaultOf(property),
      description: getDoc(program, property),
      examples: buildParameterExamples(program, property),
      location: getParameterLocation(program, property),
    };
    read.set(property, fields);
    return fields;
  };
}

/**
 * Reports the two ways an address and its declarations fail to line up.
 *
 * An expression with no declaration comes first, and it is reported on the
 * address itself. A declaration the address never names comes second, and it
 * is reported on the property that declares it. Two operations may both
 * declare one unused name, and each of them is a property the author has to
 * fix, so each one is reported.
 */
function reportAddressMismatch(
  program: Program,
  record: ChannelRecord,
  channelId: string,
  names: string[],
  declared: ReadonlyMap<string, ModelProperty[]>,
): void {
  for (const name of names) {
    if (declared.has(name)) continue;
    reportDiagnostic(program, {
      code: "missing-channel-param",
      format: { name },
      target: record.addressTarget,
    });
  }

  const used = new Set(names);
  for (const [name, properties] of declared) {
    if (used.has(name)) continue;
    for (const property of properties) {
      reportDiagnostic(program, {
        code: "unused-channel-param",
        format: { name, id: channelId },
        target: property,
      });
    }
  }
}

/**
 * Builds the Parameter Object of one name the address holds.
 *
 * Every declaration of the name is checked, not only the one that reaches
 * the document. Each declaration is a property the author wrote, and an
 * optional or non-string one is wrong wherever it sits. Checking the first
 * declaration alone would make the report depend on which operation happens
 * to come first in the source.
 *
 * The object is built from the first declaration in source order, which is
 * the same one a disagreement keeps. It is built only when every declaration
 * of the name is usable. One unusable declaration means the author still has
 * to change the type or the optionality of that name, and the emitted object
 * would describe a name the channel cannot carry yet.
 *
 * Every name the address holds reaches the map, even when nothing usable
 * describes it. An empty Parameter Object still satisfies the rule that the
 * map covers the whole address, so the rest of the document stays readable
 * while the reported mistake is unresolved.
 */
function describeParameter(
  program: Program,
  name: string,
  properties: ModelProperty[] | undefined,
  readFields: ParameterFieldReader,
  channel: ChannelTarget,
): ChannelParameterNode {
  // A node is produced for every name in the address, including one no
  // declaration describes and one whose declarations do not hold up. The
  // lower half then needs no usable flag and never parses the address again.
  const bare = { target: properties?.[0] ?? channel, name };
  if (properties === undefined) return bare;
  let usable = true;
  for (const property of properties) {
    if (!checkDeclaration(program, name, property, readFields(property))) usable = false;
  }
  if (!usable) return bare;
  return { ...bare, ...buildParameter(readFields(properties[0])) };
}

/**
 * Collects the channel parameter declarations of one channel, keyed by name.
 *
 * Two operations of one channel may declare the same parameter. That is
 * normal: a publish and a subscribe over one address both name the same
 * piece of it. The two declarations must agree, because AsyncAPI emits one
 * Parameter Object per name. The first one in source order is kept, so the
 * rest of the document stays readable, and each disagreement is reported.
 *
 * Every declaration is kept in the list, not only the first one. The caller
 * checks each of them, so a mistake in a later declaration is reported too.
 * The list holds them in source order, so its first entry is the winner.
 */
function collectDeclarations(
  program: Program,
  target: ChannelTarget,
  channelId: string,
  readFields: ParameterFieldReader,
  messages: ReadonlySet<Model>,
): Map<string, ModelProperty[]> {
  const declared = new Map<string, ModelProperty[]>();

  for (const operation of channelOperations(program, target)) {
    for (const property of operation.parameters.properties.values()) {
      const carriesMessage = unwrapModels(program, property.type).some((model) =>
        messages.has(model),
      );
      if (carriesMessage) continue;
      const previous = declared.get(property.name);
      if (previous === undefined) {
        declared.set(property.name, [property]);
        continue;
      }
      previous.push(property);
      for (const field of conflictingFields(readFields(previous[0]), readFields(property))) {
        reportDiagnostic(program, {
          code: "conflicting-channel-param",
          format: { name: property.name, id: channelId, field },
          target: property,
        });
      }
    }
  }
  return declared;
}

/**
 * Names every field two declarations of one parameter disagree about.
 * The list is empty when they agree about all five.
 * Each field is named on its own, so the message says what has to change.
 *
 * The two are compared by what they contribute to the document, not by the
 * types and the decorators they are written with. Two declarations of one
 * name sit on two operations, so each writes its own inline type. TypeSpec
 * gives every inline union and every inline model expression an object of
 * its own, so comparing the two type objects would call two identical
 * `"eu" | "us"` unions a disagreement. The values a type allows are what the
 * Parameter Object carries, so those values are what is compared.
 *
 * Two types that are not string types at all both contribute no values, so
 * they never disagree here. Each of them is reported as a non-string
 * parameter instead, which is the mistake the author has to fix first.
 */
function conflictingFields(kept: ParameterFields, added: ParameterFields): string[] {
  const fields: string[] = [];
  if (!sameValues(kept.values, added.values)) fields.push("type");
  if (kept.default !== added.default) fields.push("default");
  if (kept.description !== added.description) fields.push("description");
  if (!sameValues(kept.examples, added.examples)) fields.push("examples");
  if (kept.location !== added.location) fields.push("location");
  return fields;
}

/**
 * Tells whether two value lists hold the same values in the same order.
 * An absent list equals only another absent list. The order matters,
 * because it is the order the emitted array carries.
 */
function sameValues(left: string[] | undefined, right: string[] | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Checks one matched declaration, and reports what is wrong with it.
 *
 * @returns True when the declaration can be emitted as a Parameter Object
 */
function checkDeclaration(
  program: Program,
  name: string,
  property: ModelProperty,
  fields: ParameterFields,
): boolean {
  let usable = true;
  if (property.optional) {
    // An address expression is a bare `{name}`. RFC 6570's operators, which
    // let a separator disappear along with an absent value, have no
    // equivalent here. So an optional parameter cannot be left out of any
    // address, whatever its position, and `default` is what expresses a
    // value that is usually the same.
    reportDiagnostic(program, {
      code: "optional-channel-param",
      format: { name },
      target: property,
    });
    usable = false;
  }
  if (fields.values === undefined) {
    reportDiagnostic(program, {
      code: "non-string-channel-param",
      format: { name },
      target: property,
    });
    usable = false;
  }
  return usable;
}

/**
 * Builds one Parameter Object.
 *
 * The object holds five fields and nothing else. AsyncAPI 3 defines no
 * `schema` field here, so the declared type reaches the document only
 * through `enum`, and only when the type names a limited set of values.
 */
function buildParameter(fields: ParameterFields): Omit<ChannelParameterNode, "target" | "name"> {
  const values = fields.values;
  return {
    ...present("enumValues", values !== undefined && values.length > 0 ? values : undefined),
    ...text("default", fields.default),
    ...text("description", fields.description),
    ...present("examples", fields.examples),
    ...text("location", fields.location),
  };
}

/**
 * Reads the TypeSpec default value of one declaration as a string.
 *
 * A string literal default is taken as it is written. An enum member default
 * contributes the value that member carries. Any other default has no place
 * in a Parameter Object, whose `default` is typed as a string, so it is left
 * out.
 */
function defaultOf(property: ModelProperty): string | undefined {
  const value = property.defaultValue;
  if (value === undefined) return undefined;
  if (value.valueKind === "StringValue") return value.value;
  if (value.valueKind === "EnumValue") return enumMemberValue(value.value);
  return undefined;
}

/**
 * Builds the `examples` array of one parameter.
 *
 * The entries are the values of `@example`, in source order, serialized the
 * same way every other example in this emitter is. AsyncAPI types the array
 * as strings, so a value that serializes to anything else is left out. An
 * example that cannot be serialized at all is dropped with the warning the
 * schema layer already uses for that.
 *
 * Neither drop is silent. A parameter reaches the document only when its
 * type is a string type, and the compiler rejects an example the parameter
 * type does not accept. A parameter of any other type is reported as
 * `non-string-channel-param` and is left out along with its examples.
 */
function buildParameterExamples(program: Program, property: ModelProperty): string[] | undefined {
  // An example that carries no usable value is dropped rather than left to
  // crash the whole emit. The drop still surfaces as a diagnostic, rather
  // than happening in total silence.
  const serialized = serializeExamples(program, property, property.type, () => {
    reportDiagnostic(program, { code: "unserializable-example", target: property });
  });
  const examples = serialized.filter((value): value is string => typeof value === "string");
  return examples.length > 0 ? examples : undefined;
}

/**
 * Tells whether a declared type is a string type, and names the values it
 * allows when they are a limited set.
 *
 * A plain string scalar allows every string, so it has no value list and the
 * emitted parameter carries no `enum`. A string literal, a union of string
 * literals, and a string-backed enum each name their values, and those
 * values become the `enum`.
 *
 * @returns The allowed values, an empty array when the type is a string with
 * no limited set, or `undefined` when the type is not a string type at all
 */
function stringValuesOf(program: Program, type: Type): string[] | undefined {
  switch (type.kind) {
    case "String":
      return [type.value];
    case "Scalar":
      return isStringScalar(type) ? [] : undefined;
    case "Enum":
      return enumValues(type);
    case "EnumMember":
      // A single member stands for one string, so it names a set of one.
      // A numeric member names no string, the same rule `enumValues` follows
      // for the whole enum. Without this case the member form fell to the
      // default below and was reported as a non-string parameter, while the
      // whole-enum form `region: Region` worked.
      return typeof type.value === "number" ? undefined : [enumMemberValue(type)];
    case "Union":
      return unionValues(program, type);
    default:
      return undefined;
  }
}

/**
 * Walks the base chain of a scalar down to a built-in, and tells whether
 * that built-in is `string`.
 * A user scalar declared as `scalar topicName extends string;` is a string
 * type, so the whole chain is walked rather than the name alone. A user
 * scalar that happens to be named `string` in its own namespace is not one,
 * which is why the built-in check is by namespace.
 */
function isStringScalar(scalar: Scalar): boolean {
  let current: Scalar | undefined = scalar;
  while (current !== undefined) {
    if (isGlobalTypeSpecNamespace(current.namespace) && current.name === "string") return true;
    current = current.baseScalar;
  }
  return false;
}

/**
 * Names the values of a string-backed enum.
 * A member with no explicit value carries its own name, the same rule the
 * schema layer follows. A member backed by a number makes the whole enum a
 * non-string type, so the enum is rejected rather than half emitted.
 */
function enumValues(target: Enum): string[] | undefined {
  const values: string[] = [];
  for (const member of target.members.values()) {
    if (typeof member.value === "number") return undefined;
    values.push(enumMemberValue(member));
  }
  return values;
}

/** The string one enum member stands for. */
function enumMemberValue(member: { name: string; value?: string | number }): string {
  return typeof member.value === "string" ? member.value : member.name;
}

/**
 * Names the values of a union, when every variant is a string type.
 * A union that mixes a plain string scalar into its variants is still a
 * string type, but it no longer names a limited set, so the result is empty
 * and no `enum` is emitted.
 */
function unionValues(program: Program, union: Union): string[] | undefined {
  const values: string[] = [];
  let limited = true;
  for (const variant of union.variants.values()) {
    const variantValues = stringValuesOf(program, variant.type);
    if (variantValues === undefined) return undefined;
    if (variantValues.length === 0) limited = false;
    values.push(...variantValues);
  }
  return limited ? values : [];
}
