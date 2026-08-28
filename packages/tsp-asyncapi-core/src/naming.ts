/**
 * Builds a `components.schemas` / `components.messages` key for a
 * declaration.
 *
 * A key must stay inside the Components Object key charset and unique
 * across the document, so a declaration's own name is never used verbatim.
 * A plain identifier passes through unchanged. A backtick-quoted name, or a
 * template argument's display text, is Sep-encoded: an unsafe character
 * becomes `Sep<codePoint>`, so it can never leak into a key or a `$ref`
 * fragment.
 *
 * Two shapes of key exist. A compact composed name qualifies the
 * declaration's own name with its namespace prefix and, for a template
 * instantiation, each argument's own display name. When an argument has no
 * fixed identity of its own ("unspeakable"), the compact name is
 * unavailable, and the caller falls back to `fallbackDeclarationName`,
 * which composes the official `getTypeName` text per argument instead.
 *
 * This file is the only place that builds either shape.
 */

import {
  Type,
  Model,
  Enum,
  Scalar,
  Union,
  Namespace,
  Value,
  IndeterminateEntity,
  Program,
  TypeNameOptions,
  getEntityName,
  getFriendlyName,
  isService,
} from "@typespec/compiler";
import { COMPONENTS_KEY_PATTERN, isGlobalTypeSpecNamespace } from "./constants.js";

/** Upper-cases just the first character, leaving the rest of `text` as-is. */
function capitalizeFirst(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

/**
 * Builds the qualifying prefix for a namespace chain, e.g. `A.B` becomes
 * `"A.B."`. A namespace with no chain yields `""`.
 *
 * Each segment goes through `sanitizeDeclarationName`. This matches the
 * official `getNamespacePrefix`, so a key reads like the official
 * `getTypeName` output. The prefix qualifies both a declaration's own key
 * and a template argument's display name, so two same-named declarations in
 * different namespaces resolve to different keys.
 *
 * The trailing `.` makes the prefix injective: without it, namespace `A.B`
 * plus name `C` and namespace `A` plus name `BC` would both compose `A.BC`.
 * `.` is legal in the Components Object key charset, so it is safe to spend
 * as a separator.
 *
 * One narrow collision is still possible. `sanitizeNameSegment` keeps `.`
 * verbatim, so a backtick-quoted declaration name containing `.` can compose
 * the same key as an unrelated namespaced declaration: `` model `A.B` `` in
 * the global namespace collides with `model B` inside `namespace A`.
 * `SchemaKeyRegistry` reports that as `duplicate-schema-key`, the same as any
 * other collision.
 */
function namespacePrefix(program: Program, namespace: Namespace | undefined): string {
  const parts: string[] = [];
  let ns = namespace;
  while (ns?.name) {
    // The compiler's built-in `TypeSpec` namespace holds `Array`, `Record`,
    // and the other collection types. It is not a user namespace, so it
    // should not leak into a synthesized key.
    //
    // The service namespace is skipped for the same reason the official
    // emitters skip it: nearly every declaration in a single-service spec
    // lives under it, so it carries no distinguishing information.
    //
    // Skip just that one link and keep walking. A user namespace nested
    // under a skipped one is still collected.
    if (isGlobalTypeSpecNamespace(ns) || isService(program, ns)) {
      ns = ns.namespace;
      continue;
    }
    parts.unshift(sanitizeDeclarationName(ns.name));
    ns = ns.namespace;
  }
  return parts.length === 0 ? "" : parts.join(".") + ".";
}

/**
 * The marker the key encoding puts before a character's code point.
 *
 * A name that spells the marker itself must be escaped, or it reads back as
 * an encoded character. `sanitizeDeclarationName` and `sanitizeNameSegment`
 * both use this constant, so the two escaping passes cannot drift apart.
 */
const SEP = "Sep";

/** The marker immediately before a digit, which is what makes it ambiguous. */
const MARKER_BEFORE_DIGIT = /Sep(?=\d)/g;

/**
 * Encodes one piece of free-form text as a `components.schemas` key
 * segment.
 *
 * Two callers use it: `sanitizeDeclarationName`, for a backtick-quoted
 * declaration name such as `` model `Foo/Bar` ``, and
 * `fallbackDeclarationName`, for the official `getTypeName` text of an
 * instantiation with no composable structural name.
 *
 * The input is split on runs of non-alphanumeric characters. `-`, `_`, and
 * `.` are kept verbatim; `refFor` already escapes `~` and `/`. Every other
 * separator character is encoded as `Sep<codePoint>` instead of deleted, so
 * `` `user-created` `` and `` `user_created` `` do not collapse to the same
 * key, and `` `user#created` `` becomes `UserSep35Created` rather than one
 * indistinct `Sep` token.
 *
 * An alphanumeric segment passes through unescaped, except for the marker
 * pattern itself: `Sep` immediately followed by a digit is escaped to
 * `SepSep`. Without that, a name spelling the marker directly, such as
 * `` `ASep32B` ``, would compose the same key as `` `A B` ``, whose space
 * this scheme also encodes as `Sep32`.
 *
 * An empty result, including an all-empty input, falls back to a fixed
 * non-empty token so the key never collapses to nothing.
 */
function sanitizeNameSegment(raw: string): string {
  if (raw.length === 0) {
    return "Empty";
  }
  const parts = raw.split(/([^\dA-Za-z]+)/);
  const out = parts
    .map((part, i) => {
      if (i % 2 === 0) {
        return capitalizeFirst(part.replace(MARKER_BEFORE_DIGIT, SEP + SEP));
      }
      if (/^[-_.]+$/.test(part)) {
        return part;
      }
      return Array.from(part)
        .map((ch) => `${SEP}${String(ch.codePointAt(0) ?? 0)}`)
        .join("");
    })
    .join("");
  return out.length === 0 ? "Empty" : out;
}

/**
 * Tells whether `name` can be used as a Components Object key verbatim.
 *
 * A caller that takes a key straight from the author, such as the
 * `@message` argument, uses this to warn before `sanitizeDeclarationName`
 * rewrites the text into something the author never asked for.
 */
export function isSafeComponentsKey(name: string): boolean {
  return COMPONENTS_KEY_PATTERN.test(name);
}

/**
 * Sanitizes a named declaration's own name, e.g. `Model.name`, for use as a
 * Components Object key candidate. `components.schemas` and
 * `components.messages` share the same key charset, so both use this
 * sanitizer.
 *
 * A plain TypeSpec identifier already lies entirely inside
 * `COMPONENTS_KEY_PATTERN` and is returned unchanged, case included, so
 * every existing key stays stable. A backtick-quoted name, which can carry
 * arbitrary characters, is run through `sanitizeNameSegment` instead. An
 * empty name is returned unchanged; that only happens for an anonymous
 * type, which callers already special-case before a name is ever needed.
 *
 * @param name - The declaration's own name
 * @returns A name every `components` map accepts as a key
 * @public
 */
export function sanitizeDeclarationName(name: string): string {
  if (name.length === 0) {
    return name;
  }
  if (COMPONENTS_KEY_PATTERN.test(name)) {
    // The name needs no encoding, but it may still spell the marker the
    // encoding uses. `Sep47` is a legal declaration name, and `` `/` ``
    // encodes to exactly that, so the two would claim one key. Escaping the
    // marker here keeps them apart. The rest of the name is untouched, case
    // included, so an ordinary identifier keeps the key it already has.
    return name.replace(MARKER_BEFORE_DIGIT, SEP + SEP);
  }
  return sanitizeNameSegment(name);
}

/**
 * Builds a short, human-legible name for one template argument, or
 * `undefined` when the argument is "unspeakable".
 *
 * This name composes a stable `components.schemas` key for a template
 * instantiation: `Envelope<Order>` becomes `EnvelopeOrder`. "Unspeakable"
 * is the same classification the official `@typespec/asset-emitter`
 * `TypeEmitter.declarationName` makes: a template argument with no fixed,
 * nameable identity of its own fails the *entire* instantiation's composed
 * name. The unspeakable cases are a `String`/`Number`/`Boolean` literal, a
 * `StringTemplate`, a `Tuple`, a genuine `Value`, and an anonymous `Model`
 * or `Union`. A named `Model`/`Union` argument that is itself a template
 * instantiation propagates unspeakability recursively.
 *
 * Unspeakable does not mean nameless. The official consumers never stop at
 * `declarationName`'s `undefined`; `@typespec/openapi3` falls back to
 * `getTypeName` text instead. This emitter's `fallbackDeclarationName`
 * provides the same last-resort text. What differs here is that inlining is
 * preferred while it stays representable, because a `getTypeName`-derived
 * key is long next to a compact composed one.
 *
 * A genuine `Value` argument occurs where the template parameter is
 * constrained to a value, e.g. `P<c>` for `model P<T extends valueof
 * string>` and some `const c`. It carries no nameable identity, so it is
 * unspeakable; a fixed placeholder would instead make two instantiations
 * from two different `const`s claim one key.
 *
 * A literal or enum member written directly in a template argument list,
 * such as `P<"created">` or `P<42>`, does not arrive here as its own
 * `Type.kind`. `@typespec/compiler` 1.14.0 wraps it in an
 * `IndeterminateEntity` instead, because the compiler has not yet decided
 * whether the parameter is used as a type or a value. Its `.type` is always
 * a real `Type` with a `kind`, so unwrapping it and recursing here gives a
 * bare literal argument the same handling a directly-typed one gets.
 */
function templateArgDisplayName(
  program: Program,
  arg: Type | Value | IndeterminateEntity,
): string | undefined {
  if ("entityKind" in arg && arg.entityKind === "Indeterminate") {
    return templateArgDisplayName(program, arg.type);
  }
  if (!("kind" in arg)) {
    // A genuine value. Unspeakable; see this function's own doc comment.
    return undefined;
  }
  switch (arg.kind) {
    case "Model":
      // Unspeakable when anonymous. Otherwise `arg`'s own key name qualifies
      // it, which can itself be unspeakable and propagate up here.
      return arg.name ? declarationNameFor(program, arg) : undefined;
    case "Scalar":
      // Sanitized the same way a `Model`/`Union`/`Enum` argument's name is.
      return (
        namespacePrefix(program, arg.namespace) + capitalizeFirst(sanitizeDeclarationName(arg.name))
      );
    case "Enum":
      return declarationNameFor(program, arg);
    case "EnumMember": {
      // An `Enum` is always named, so its own name is never unspeakable.
      const enumName = declarationNameFor(program, arg.enum);
      return enumName === undefined ? undefined : enumName + capitalizeFirst(arg.name);
    }
    case "Union":
      // Unspeakable when anonymous.
      return arg.name === undefined ? undefined : declarationNameFor(program, arg);
    case "String":
      // A literal value has no fixed identity of its own.
      return undefined;
    case "StringTemplate":
      // A reduced template is a literal value too. Naming it after its text
      // would also let `P<"abc">` and `P<"a${"b"}c">`, the same value,
      // resolve to different keys.
      return undefined;
    case "Number":
      // A literal value has no fixed identity of its own.
      return undefined;
    case "Boolean":
      // A literal value has no fixed identity of its own.
      return undefined;
    case "Intrinsic":
      // Every built-in intrinsic name is already a plain identifier, so
      // sanitizing is a no-op for them.
      return capitalizeFirst(sanitizeDeclarationName(arg.name));
    case "Tuple":
      // A tuple has no fixed identity of its own.
      return undefined;
    default:
      // An unhandled kind, such as an `Operation` or `Interface`, has no
      // fixed identity to compose a key from. A placeholder token would
      // instead make two such arguments claim one key.
      return undefined;
  }
}

/**
 * Builds the structural, unqualified name for a `Model`/`Union`
 * declaration.
 *
 * For a template instantiation, the name is the template's own name plus
 * each argument's display name, e.g. `Envelope<Order>` becomes
 * `EnvelopeOrder`. `Model` and `Union` share this function, so a template
 * *union* instantiation gets the same treatment a model one does. For a
 * non-template, or an uninstantiated declaration, the plain declaration
 * name is returned unchanged.
 *
 * Returns `undefined` when any argument is itself unspeakable, see
 * `templateArgDisplayName`. This can never happen for a non-template type.
 * `undefined` here means only "no compact composed name". The type is
 * still nameable through `fallbackDeclarationName`.
 *
 * The caller, `declarationNameFor`, adds the namespace qualification and
 * handles `@friendlyName`. This function is purely structural.
 */
function templateInstanceName(program: Program, type: Model | Union): string | undefined {
  const mapper = type.templateMapper;
  const ownName = sanitizeDeclarationName(type.name ?? "");
  if (mapper === undefined || mapper.args.length === 0) {
    return ownName;
  }
  const argNames = mapper.args.map((arg) => templateArgDisplayName(program, arg));
  // One unspeakable argument makes the whole instantiation unspeakable.
  return argNames.includes(undefined) ? undefined : ownName + argNames.join("");
}

/**
 * Returns true for an uninstantiated template *declaration*: `Env` named
 * directly in source, excluding an instantiation like `Env<string>`.
 *
 * Its properties or variants are bare `TemplateParameter`s with no real
 * shape, so the caller emits the unconstrained schema instead of
 * registering a bogus key. `Model` and `Union` both share this check.
 *
 * @public
 */
export function isUninstantiatedTemplateDeclaration(type: Model | Union): boolean {
  return (
    type.node !== undefined &&
    "templateParameters" in type.node &&
    type.node.templateParameters.length > 0 &&
    type.templateMapper === undefined
  );
}

/**
 * The `TypeNameOptions` this emitter passes to the official
 * `getEntityName`.
 * The filter drops exactly the namespaces `namespacePrefix` drops: the
 * compiler's built-in `TypeSpec` namespace and the service namespace. So a
 * fallback key qualifies a declaration the same way a composed key does.
 * `@typespec/openapi3` builds the same filter, comparing each namespace's
 * full name against its own `serviceNamespaceName`.
 */
function typeNameOptions(program: Program): TypeNameOptions {
  return {
    namespaceFilter: (ns) => !isGlobalTypeSpecNamespace(ns) && !isService(program, ns),
  };
}

/**
 * Builds the last-resort `components.schemas` key for a named declaration
 * with no compact composed name. That declaration is a template
 * instantiation with an unspeakable argument.
 *
 * The key keeps the shape a compact key has, namespace prefix plus own name
 * plus one segment per template argument. Only the argument segments
 * differ: each comes from the official `getEntityName`, the text
 * `@typespec/openapi3` falls back to. That text can carry characters the
 * Components Object key charset forbids, such as `{` from `{x: string}`, so
 * it is Sep-encoded through `sanitizeNameSegment`.
 *
 * Composing per argument, rather than sanitizing the whole declaration's
 * `getTypeName`, is what keeps two instantiations apart: `getTypeName`
 * drops a *union*'s template arguments, so `Chain<{a: string}>` and
 * `Chain<{b: string}>` would both reduce to `Chain` and collide.
 *
 * The result is long and hard to read. The caller only reaches this name
 * when inlining cannot express the type.
 *
 * @public
 */
export function fallbackDeclarationName(program: Program, type: Model | Union): string {
  return namespacePrefix(program, type.namespace) + fallbackInstanceName(program, type);
}

/**
 * The unqualified half of `fallbackDeclarationName`: own name plus one
 * segment per template argument, with no namespace prefix.
 * `unqualifiedDeclarationName` shares it, so a message key and a schema key
 * describe the same instantiation with the same text.
 */
function fallbackInstanceName(program: Program, type: Model | Union): string {
  const options = typeNameOptions(program);
  const argNames = (type.templateMapper?.args ?? []).map((arg) =>
    sanitizeNameSegment(getEntityName(arg, options)),
  );
  return sanitizeDeclarationName(type.name ?? "") + argNames.join("");
}

/**
 * Builds a declaration's name without any namespace qualification.
 *
 * `components.messages` keys use it. They are deliberately not qualified by
 * namespace, unlike `components.schemas` keys, so two same-named message
 * models in different namespaces collide and the caller reports that.
 *
 * Everything else matches how a schema key is built, on purpose. A
 * `@friendlyName` wins outright. A template instantiation composes its
 * argument names, or falls back to the same per-argument text
 * `fallbackDeclarationName` uses. Taking the raw `Model.name` instead would
 * give every instantiation of one template the same bare name.
 */
export function unqualifiedDeclarationName(program: Program, type: Model | Union): string {
  const friendlyName = getFriendlyName(program, type);
  if (friendlyName !== undefined) {
    return sanitizeDeclarationName(friendlyName);
  }
  return templateInstanceName(program, type) ?? fallbackInstanceName(program, type);
}

/**
 * Computes the compact `components.schemas` key candidate for a named
 * declaration: a model, enum, or named union. Returns `undefined` when
 * `type` is a template instantiation whose own name computation is
 * unspeakable, see `templateInstanceName`. The caller then either inlines
 * the type or, when inlining cannot express it, keys it under
 * `fallbackDeclarationName`.
 *
 * A user-applied `\@friendlyName`, e.g.
 * `\@friendlyName("\{name\}Envelope")`, is checked first. The compiler
 * resolves its own template-parameter interpolation per instantiation, and
 * that resolved name is the candidate outright, with no namespace
 * qualification. This holds for every kind here.
 *
 * With no friendly name, the candidate is the structural name qualified by
 * the declaration's own namespace chain, via `namespacePrefix`. This matches
 * the official `getTypeName`/`getNamespacePrefix` default naming, so two
 * same-named declarations in different namespaces resolve to different
 * keys.
 *
 * No further disambiguation happens here. This one candidate is handed to
 * `SchemaBuilder.registerNamed` (via `SchemaKeyRegistry`), which decides
 * whether it is actually free. Two declarations resolving to the same
 * candidate are reported there as `duplicate-schema-key`.
 *
 * @public
 */
export function declarationNameFor(
  program: Program,
  type: Model | Enum | Scalar | Union,
): string | undefined {
  const friendlyName = getFriendlyName(program, type);
  if (friendlyName !== undefined) {
    return sanitizeDeclarationName(friendlyName);
  }
  switch (type.kind) {
    case "Model":
    case "Union": {
      const instanceName = templateInstanceName(program, type);
      if (instanceName === undefined) {
        return undefined;
      }
      return namespacePrefix(program, type.namespace) + instanceName;
    }
    case "Enum":
    case "Scalar":
      // Neither takes template arguments, so there is no structural
      // composition to build, only the bare declaration name. Both are
      // always named declarations; neither can be unspeakable.
      return namespacePrefix(program, type.namespace) + sanitizeDeclarationName(type.name);
  }
}
