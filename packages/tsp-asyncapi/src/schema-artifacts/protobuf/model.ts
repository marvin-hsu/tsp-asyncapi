/**
 * The intermediate structure of one generated Protobuf payload, and the walk
 * that builds it.
 *
 * A payload's proto3 text carries every message and enum its root model
 * reaches, because the text stands alone and a reader resolves no imports.
 * The walk builds this closure: starting at the root, it follows every
 * field and records each declaration it reaches. A declaration enters the
 * map before its own fields are walked, so a model that reaches itself
 * finds its name already there and stops; nothing here needs a second pass
 * to prune or check.
 *
 * The root is the model the caller asks for. A reader of the finished text
 * has no such argument, so the official AsyncAPI Protobuf parser infers the
 * root as the declaration nothing else references, ignoring self
 * references. Two messages that reference each other leave that parser no
 * such declaration to pick; both payloads stay correct proto3 regardless,
 * each carrying both declarations.
 *
 * The structure below is the smallest one the printer needs; every field it
 * has is one the printer reads. Where proto3 has no honest form for what the
 * walk reached, the walk reports `protobuf-artifact-unavailable` and the
 * caller writes no artifact for that model.
 */

import {
  getDoc,
  getTypeName,
  type Enum,
  type Model,
  type ModelProperty,
  type Namespace,
  type Program,
  type Scalar,
  type Type,
} from "@typespec/compiler";
import { reportDiagnostic } from "tsp-asyncapi-core";
import {
  isProtobufExternRef,
  isProtobufMap,
  protobufFieldIndexOf,
  protobufReservationsOf,
  protoMessageNameOf,
  resolveProtobufPackage,
} from "tsp-asyncapi-core/unstable";

/**
 * One payload: the proto3 file that describes one model.
 *
 * @internal
 */
export interface ProtoPayloadModel {
  /** The package name, or `undefined` when the package declares none. */
  readonly packageName: string | undefined;
  /** The closure of the root, in the order the walk reached it. */
  readonly declarations: readonly ProtoDeclaration[];
  /** The name of the message the payload describes. */
  readonly rootName: string;
}

/**
 * A top level declaration of a proto3 file.
 *
 * @internal
 */
export type ProtoDeclaration = ProtoMessage | ProtoEnum;

/**
 * One `message` block.
 *
 * @internal
 */
export interface ProtoMessage {
  /** Marks this declaration as a message. */
  readonly kind: "message";
  /** The message name, as the official naming rule gives it. */
  readonly name: string;
  /** The documentation of the model, or `undefined` when it has none. */
  readonly doc: string | undefined;
  /** The field numbers and ranges the message reserves, in source order. */
  readonly reservedNumbers: readonly ProtoReservedNumber[];
  /** The field names the message reserves, in source order. */
  readonly reservedNames: readonly string[];
  /** The fields, in the order the model declares its properties. */
  readonly fields: readonly ProtoField[];
}

/** One reserved field number, or one inclusive range of them. */
type ProtoReservedNumber = number | readonly [number, number];

/**
 * One field of a message.
 *
 * @internal
 */
export interface ProtoField {
  /** The field name, as the model property spells it. */
  readonly name: string;
  /** The field number, from the `@Protobuf.field` state. */
  readonly index: number;
  /** The type to write: a proto3 scalar name, or a declaration name. */
  readonly type: string;
  /** Whether the field takes the `repeated` label. */
  readonly repeated: boolean;
  /** Whether the field takes the proto3 `optional` label. */
  readonly optional: boolean;
  /** The documentation of the property, or `undefined` when it has none. */
  readonly doc: string | undefined;
}

/**
 * One `enum` block.
 *
 * @internal
 */
export interface ProtoEnum {
  /** Marks this declaration as an enum. */
  readonly kind: "enum";
  /** The enum name, which is the TypeSpec name unchanged. */
  readonly name: string;
  /** The documentation of the enum, or `undefined` when it has none. */
  readonly doc: string | undefined;
  /** Whether two variants share a value, which proto3 needs told. */
  readonly allowAlias: boolean;
  /** The variants, in the order the enum declares its members. */
  readonly variants: readonly ProtoEnumVariant[];
}

/** One variant of an enum, as the printer writes it. */
interface ProtoEnumVariant {
  /** The variant name, as the enum member spells it. */
  readonly name: string;
  /** The variant number, which proto3 requires to be an integer. */
  readonly value: number;
  /** The documentation of the member, or `undefined` when it has none. */
  readonly doc: string | undefined;
}

/**
 * Every scalar the official Protobuf library maps, by qualified name.
 *
 * This mirrors the table of the pinned version, which holds 15 rows: nine
 * built in TypeSpec scalars, and the six the Protobuf library declares.
 *
 * The official table is keyed by resolved type, which costs one resolution
 * pass per program. This one is keyed by the name the type carries, so it is
 * a constant and holds no state of any program.
 *
 * The upgrade gate re-checks this table against the parity tests.
 */
const PROTO_SCALARS = new Map<string, string>([
  ["TypeSpec.bytes", "bytes"],
  ["TypeSpec.boolean", "bool"],
  ["TypeSpec.string", "string"],
  ["TypeSpec.int32", "int32"],
  ["TypeSpec.int64", "int64"],
  ["TypeSpec.uint32", "uint32"],
  ["TypeSpec.uint64", "uint64"],
  ["TypeSpec.float32", "float"],
  ["TypeSpec.float64", "double"],
  ["TypeSpec.Protobuf.sfixed32", "sfixed32"],
  ["TypeSpec.Protobuf.sfixed64", "sfixed64"],
  ["TypeSpec.Protobuf.sint32", "sint32"],
  ["TypeSpec.Protobuf.sint64", "sint64"],
  ["TypeSpec.Protobuf.fixed32", "fixed32"],
  ["TypeSpec.Protobuf.fixed64", "fixed64"],
]);

/**
 * The proto3 types a map key may take.
 *
 * proto3 allows an integral or a string key, and nothing else. TypeSpec
 * constrains the key of `Protobuf.Map` the same way, so an author reaches
 * this set through the constraint. It is checked again here, because the
 * constraint belongs to another library and this emitter writes the text.
 */
const MAP_KEY_SCALARS = new Set([
  "bool",
  "string",
  "int32",
  "int64",
  "uint32",
  "uint64",
  "sint32",
  "sint64",
  "fixed32",
  "fixed64",
  "sfixed32",
  "sfixed64",
]);

/** What one walk carries, so each step takes one value rather than five. */
interface Walk {
  /** The program to read state from and to report against. */
  readonly program: Program;
  /** The model the payload describes, which every diagnostic names. */
  readonly root: Model;
  /** The namespace that declares the package of the root. */
  readonly packageNamespace: Namespace;
  /** What a diagnostic calls the package of the root. */
  readonly packageLabel: string;
  /**
   * The closure so far, keyed by the declaration itself. Insertion order is
   * visit order.
   *
   * The key is the type and not the rendered name. Two declarations can carry
   * one rendered name, and keying by that name would answer the first one for
   * the second and describe two declarations as one message.
   */
  readonly declared: Map<Model | Enum, ProtoDeclaration | undefined>;
  /** Which declaration took each rendered name, so a clash is seen. */
  readonly claimed: Map<string, Model | Enum>;
}

/**
 * Builds the payload of one model, or reports why there is none.
 *
 * @internal
 */
export function buildPayloadModel(program: Program, root: Model): ProtoPayloadModel | undefined {
  const found = resolveProtobufPackage(program, root);
  if (found === undefined) {
    reportDiagnostic(program, {
      code: "protobuf-artifact-unavailable",
      messageId: "no-package",
      target: root,
      format: { name: root.name },
    });
    return undefined;
  }
  if (found.kind === "unreadable") {
    reportDiagnostic(program, {
      code: "protobuf-artifact-unavailable",
      messageId: "not-converted",
      target: found.namespace,
      format: {
        name: root.name,
        package: getTypeName(found.namespace),
        construct: "a @Protobuf.package declaration this emitter cannot read",
      },
    });
    return undefined;
  }

  const walk: Walk = {
    program,
    root,
    packageNamespace: found.namespace,
    // A diagnostic names the package, and a package with no name still has to
    // be named there. It is named by the namespace that declares it.
    packageLabel: found.name ?? getTypeName(found.namespace),
    declared: new Map(),
    claimed: new Map(),
  };
  const rootName = visitModel(walk, root);
  if (rootName === undefined) return undefined;

  const declarations: ProtoDeclaration[] = [];
  for (const declaration of walk.declared.values()) {
    // Every placeholder is replaced before the walk of its message returns,
    // and a walk that did not return that far has already answered undefined.
    if (declaration !== undefined) declarations.push(declaration);
  }
  return { packageName: found.name, declarations, rootName };
}

/**
 * Reports that the walk reached something with no proto3 form.
 *
 * The caller answers `undefined` after calling this, so a reader sees both
 * the report and the end of the walk as separate steps.
 */
function refuse(walk: Walk, target: Type, construct: string): void {
  reportDiagnostic(walk.program, {
    code: "protobuf-artifact-unavailable",
    messageId: "not-converted",
    target,
    format: { name: walk.root.name, package: walk.packageLabel, construct },
  });
}

/**
 * Adds one model to the closure and returns the name to refer to it by.
 *
 * The name is recorded before the fields are walked. A model that reaches
 * itself, directly or through another model, finds the name already there
 * and stops. That is what makes the closure finite without a visited set.
 */
function visitModel(walk: Walk, model: Model): string | undefined {
  if (model.name === "") {
    refuse(walk, model, "an anonymous model");
    return undefined;
  }
  const name = protoMessageNameOf(walk.program, model);
  if (name === undefined) {
    refuse(walk, model, "a template instantiation");
    return undefined;
  }
  if (!checkPackage(walk, model, "model", model.name)) return undefined;
  if (walk.declared.has(model)) return name;
  if (!claimName(walk, model, name)) return undefined;
  walk.declared.set(model, undefined);

  const reserved = reservationsOf(walk, model, name);
  if (reserved === undefined) return undefined;

  const fields: ProtoField[] = [];
  for (const property of model.properties.values()) {
    const field = fieldOf(walk, property);
    if (field === undefined) return undefined;
    fields.push(field);
  }

  walk.declared.set(model, {
    kind: "message",
    name,
    doc: getDoc(walk.program, model),
    reservedNumbers: reserved.numbers,
    reservedNames: reserved.names,
    fields,
  });
  return name;
}

/** What one model reserves, split the way proto3 writes the two lines. */
interface Reservations {
  /** The reserved field numbers and inclusive ranges, in source order. */
  readonly numbers: ProtoReservedNumber[];
  /** The reserved field names, in source order. */
  readonly names: string[];
}

/**
 * Reads what a model reserves, or reports that the state is unreadable.
 *
 * `@Protobuf.reserve` stores field numbers, ranges, and names in a list
 * that belongs to another library, which promises nothing about its shape.
 * Every entry is checked, and any entry of an unrecognized shape ends the
 * walk: skipping it would drop a reservation, letting a later author reuse
 * a number a released message already spent.
 */
function reservationsOf(walk: Walk, model: Model, name: string): Reservations | undefined {
  const stored = protobufReservationsOf(walk.program, model);
  const reserved: Reservations = { numbers: [], names: [] };
  if (stored === undefined) return reserved;

  const construct = `message '${name}' with a @Protobuf.reserve list this emitter cannot read`;
  if (!Array.isArray(stored)) {
    refuse(walk, model, construct);
    return undefined;
  }

  for (const entry of stored as unknown[]) {
    if (typeof entry === "string") {
      reserved.names.push(entry);
    } else if (isFieldNumber(entry)) {
      reserved.numbers.push(entry);
    } else if (isFieldRange(entry)) {
      reserved.numbers.push([entry[0], entry[1]]);
    } else {
      refuse(walk, model, construct);
      return undefined;
    }
  }
  return reserved;
}

/**
 * The highest field number proto3 gives a message, which the official
 * decorator enforces as well.
 */
const MAX_FIELD_NUMBER = 2 ** 29 - 1;

/**
 * Whether a value is a field number proto3 can write.
 *
 * proto3 numbers a field from one, so zero is no field number. A number
 * above {@link MAX_FIELD_NUMBER} has no line either.
 */
function isFieldNumber(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isInteger(value)) return false;
  return value >= 1 && value <= MAX_FIELD_NUMBER;
}

/** Whether a value is an inclusive range of field numbers, lower one first. */
function isFieldRange(value: unknown): value is [number, number] {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const range = value as unknown[];
  return isFieldNumber(range[0]) && isFieldNumber(range[1]) && range[0] <= range[1];
}

/**
 * Checks that a declaration the walk reached lives in the package of the
 * root, and reports why it does not.
 *
 * A declaration of another package needs an `import` line to reach, but one
 * payload carries no imports, so this emitter refuses rather than writing a
 * name that resolves to nothing. Packages are compared by the namespace
 * that declares them, not by name, since two namespaces can declare one
 * name and still be two packages.
 */
function checkPackage(walk: Walk, type: Model | Enum, kind: string, name: string): boolean {
  const found = resolveProtobufPackage(walk.program, type);
  if (found?.namespace === walk.packageNamespace) return true;
  if (found === undefined) {
    refuse(walk, type, `${kind} '${name}' that no @Protobuf.package covers`);
    return false;
  }
  refuse(walk, type, `${kind} '${name}' of another Protobuf package`);
  return false;
}

/**
 * Takes a rendered name for one declaration, or reports that it is taken.
 *
 * proto3 gives one file one name per declaration. Two declarations of one
 * package can still render to one name: two sub-namespaces may each declare
 * `Foo`, or a model and an enum may converge once the model name is
 * capitalized. Writing either pair would describe two declarations as one.
 */
function claimName(walk: Walk, type: Model | Enum, name: string): boolean {
  const holder = walk.claimed.get(name);
  if (holder !== undefined && holder !== type) {
    refuse(walk, type, `the name '${name}', which another declaration already takes`);
    return false;
  }
  walk.claimed.set(name, type);
  return true;
}

/** Builds one field, or reports why the model has no payload. */
function fieldOf(walk: Walk, property: ModelProperty): ProtoField | undefined {
  const index = protobufFieldIndexOf(walk.program, property);
  if (!isFieldNumber(index)) {
    refuse(walk, property, `property '${property.name}' with no @Protobuf.field number`);
    return undefined;
  }

  const declared = property.type;
  const repeated = isArrayInstance(declared);
  const target = repeated ? elementOf(declared) : declared;
  if (target === undefined) {
    refuse(walk, property, `property '${property.name}' whose array element is not a type`);
    return undefined;
  }
  const type = fieldTypeOf(walk, target, property, repeated);
  if (type === undefined) return undefined;

  return {
    name: property.name,
    index,
    type,
    repeated,
    optional: takesOptionalLabel(property, repeated),
    doc: getDoc(walk.program, property),
  };
}

/**
 * The type to write for one field, which is the one place a map may appear.
 *
 * proto3 gives a map field no label: it is neither repeated nor optional,
 * and it cannot be the element of a list or the value of another map. So a
 * map is read here, at the top of a field, and refused everywhere else.
 */
function fieldTypeOf(
  walk: Walk,
  target: Type,
  property: ModelProperty,
  repeated: boolean,
): string | undefined {
  // `Protobuf.Map` is declared as a model, so a marked type is a model. The
  // kind is read here rather than asserted below, which is what lets
  // `mapTypeOf` take the type with no cast.
  if (!isProtobufMap(walk.program, target) || target.kind !== "Model") {
    return typeNameOf(walk, target, property);
  }
  if (repeated) {
    refuse(walk, property, `property '${property.name}' with an array of Protobuf.Map values`);
    return undefined;
  }
  return mapTypeOf(walk, target, property);
}

/**
 * The `map<K, V>` type of one map field, adding the value to the closure.
 *
 * The key resolves through the same scalar table every other field uses,
 * then must be a type proto3 accepts as a key. The value resolves the same
 * way any other field type does, so a message value joins the closure. An
 * array value is refused here rather than passed on, since proto3 gives a
 * map value no label of its own.
 */
function mapTypeOf(walk: Walk, map: Model, property: ModelProperty): string | undefined {
  const args = map.templateMapper?.args ?? [];
  if (args.length !== 2) {
    refuse(walk, property, `property '${property.name}' of a Protobuf.Map with no key and value`);
    return undefined;
  }
  const [key, value] = args;
  if (!("kind" in key) || !("kind" in value)) {
    refuse(walk, property, `property '${property.name}' of a Protobuf.Map of values, not types`);
    return undefined;
  }
  if (key.kind !== "Scalar") {
    refuse(walk, property, `property '${property.name}' of a Protobuf.Map keyed by a ${key.kind}`);
    return undefined;
  }

  const keyName = scalarNameOf(walk, key);
  if (keyName === undefined) return undefined;
  if (!MAP_KEY_SCALARS.has(keyName)) {
    refuse(walk, property, `property '${property.name}' of a Protobuf.Map keyed by '${keyName}'`);
    return undefined;
  }
  if (isArrayInstance(value)) {
    refuse(walk, property, `property '${property.name}' of a Protobuf.Map whose value is an array`);
    return undefined;
  }
  const valueName = typeNameOf(walk, value, property);
  if (valueName === undefined) return undefined;
  return `map<${keyName}, ${valueName}>`;
}

/** The type name to write for one field, adding what it reaches to the closure. */
function typeNameOf(walk: Walk, type: Type, property: ModelProperty): string | undefined {
  if (isProtobufExternRef(walk.program, type)) {
    refuse(walk, property, `property '${property.name}' of an @Protobuf.externRef type`);
    return undefined;
  }
  switch (type.kind) {
    case "Scalar":
      return scalarNameOf(walk, type);
    case "Model":
      // Both refusals below are about a model: `Protobuf.Map` is a model
      // instantiation, and so is `Array<T>`. They are read inside this case
      // rather than above the switch, so neither check has to say what kind
      // of type it just recognized.
      if (isProtobufMap(walk.program, type)) {
        refuse(
          walk,
          property,
          `property '${property.name}' with a Protobuf.Map inside another type`,
        );
        return undefined;
      }
      if (isArrayInstance(type)) {
        refuse(walk, property, `property '${property.name}' with an array of arrays`);
        return undefined;
      }
      return visitModel(walk, type);
    case "Enum":
      return visitEnum(walk, type);
    default:
      refuse(walk, property, `property '${property.name}' of kind ${type.kind}`);
      return undefined;
  }
}

/**
 * The proto3 name of a scalar, following what it extends.
 *
 * A scalar outside the table is looked up again through the scalar it
 * extends, which is how a custom scalar reaches a proto3 type. A chain that
 * ends outside the table has no type to write.
 */
function scalarNameOf(walk: Walk, scalar: Scalar): string | undefined {
  let current: Scalar | undefined = scalar;
  while (current !== undefined) {
    const name = PROTO_SCALARS.get(qualifiedNameOf(current));
    if (name !== undefined) return name;
    current = current.baseScalar;
  }
  reportDiagnostic(walk.program, {
    code: "protobuf-artifact-unavailable",
    messageId: "unknown-scalar",
    target: scalar,
    format: { scalar: getTypeName(scalar), name: walk.root.name, package: walk.packageLabel },
  });
  return undefined;
}

/**
 * Adds one enum to the closure and returns the name to refer to it by.
 *
 * proto3 numbers its variants and requires the first one to be zero. An
 * enum that breaks either rule is refused, matching the official emitter.
 */
function visitEnum(walk: Walk, target: Enum): string | undefined {
  const name = target.name;
  if (!checkPackage(walk, target, "enum", name)) return undefined;
  if (walk.declared.has(target)) return name;
  if (!claimName(walk, target, name)) return undefined;

  const members = [...target.members.values()];
  const values = members.map((member) => member.value);
  if (values.some((value) => typeof value !== "number" || !Number.isInteger(value))) {
    refuse(walk, target, `enum '${name}' with a variant that is not an integer`);
    return undefined;
  }
  if (values[0] !== 0) {
    refuse(walk, target, `enum '${name}' whose first variant is not zero`);
    return undefined;
  }

  walk.declared.set(target, {
    kind: "enum",
    name,
    doc: getDoc(walk.program, target),
    allowAlias: new Set(values).size !== values.length,
    variants: members.map((member) => ({
      name: member.name,
      value: member.value as number,
      doc: getDoc(walk.program, member),
    })),
  });
  return name;
}

/**
 * Whether a field takes the proto3 `optional` label.
 *
 * This mirrors the rule of the pinned version. Only an optional property of
 * a scalar or an enum takes the label. A repeated field never does, and
 * neither does a message field, since proto3 already tracks whether one is
 * set.
 */
function takesOptionalLabel(property: ModelProperty, repeated: boolean): boolean {
  if (!property.optional || repeated) return false;
  return property.type.kind === "Scalar" || property.type.kind === "Enum";
}

/**
 * Whether a type is an instantiation of the built in `Array`.
 *
 * The answer narrows the type, so a caller asking for the element needs no
 * cast to say what the check already established.
 */
function isArrayInstance(type: Type): type is Model {
  return type.kind === "Model" && type.name === "Array" && type.namespace?.name === "TypeSpec";
}

/** The element type of an array instantiation. */
function elementOf(array: Model): Type | undefined {
  const argument = array.templateMapper?.args[0];
  return argument !== undefined && "kind" in argument ? argument : undefined;
}

/**
 * The name of a type with every namespace above it, joined by dots.
 *
 * `getTypeName` shortens a name that needs no qualification, so it cannot
 * key a lookup table. This one always spells the whole path, matching how
 * the scalar table is keyed.
 */
function qualifiedNameOf(scalar: Scalar): string {
  const parts = [scalar.name];
  let namespace = scalar.namespace;
  while (namespace !== undefined && namespace.name !== "") {
    parts.unshift(namespace.name);
    namespace = namespace.namespace;
  }
  return parts.join(".");
}
