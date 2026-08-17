import {
  Type,
  Model,
  Enum,
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
import { ReferenceObject } from "./types.js";
import { isGlobalTypeSpecNamespace } from "./constants.js";
import { componentsSchemaRef } from "./lower/json-pointer.js";

/** Upper-cases just the first character, leaving the rest of `text` as-is. */
function capitalizeFirst(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

/**
 * Builds the qualifying prefix for a namespace chain.
 * Each namespace's own name goes through `sanitizeDeclarationName`, the same
 * sanitizer a declaration's own name uses. The segments are joined with `.`,
 * and the whole prefix ends with a trailing `.`. For example, `A.B` becomes
 * `"A.B."`.
 * A plain TypeSpec identifier passes through the sanitizer unchanged, casing
 * included, so every ordinary key stays byte-identical. A backtick-quoted
 * namespace name such as `` `a/b` `` is Sep-encoded instead, so a character
 * outside `SAFE_KEY_CHARSET` can never leak into the key or into the `$ref`
 * fragment built from it.
 * This matches the official `getNamespacePrefix`, which also returns a
 * trailing-dot prefix, so a declaration key reads like the official
 * `getTypeName` output, for example `A.B.Widget`.
 * The prefix qualifies both a named declaration's own key and a
 * `Model`/`Union` template argument's display name. Two same-named
 * declarations in different namespaces then resolve to different keys instead
 * of colliding.
 * The global namespace's name is `""`. So a declaration with no namespace
 * yields `""` and keeps its bare name.
 *
 * The trailing `.` is what makes the prefix injective at the name boundary.
 * Without it, namespace `A.B` plus name `C` and namespace `A` plus name `BC`
 * would both compose `A.BC`. `.` is legal in the AsyncAPI Components Object
 * key charset, `^[a-zA-Z0-9\.\-_]+$`, so it is safe to spend as a separator.
 * One narrower, accepted collision is still left.
 * `sanitizeNameSegment` keeps `.` verbatim, so a backtick-quoted
 * *declaration* name that contains `.` can compose the same key as an
 * unrelated namespaced declaration. For example, `` model `A.B` `` in the
 * global namespace composes the same key as `model B` inside
 * `namespace A`.
 * That rare case is a hard error: `SchemaKeyRegistry` reports
 * `duplicate-schema-key` for it, the same as for any other key collision.
 * Introducing a second reserved marker is not worth it: both call sites
 * already treat `.` as a safe passthrough character.
 */
function namespacePrefix(program: Program, namespace: Namespace | undefined): string {
  const parts: string[] = [];
  let ns = namespace;
  while (ns?.name) {
    // The compiler's built-in `TypeSpec` namespace is home to `Array`,
    // `Record`, and the other built-in collection types.
    // It sits directly under the global namespace
    // (`ns.namespace?.name === ""`).
    // It is not a user namespace. So it should not leak into a synthesized
    // key the way a real user namespace does.
    //
    // The service namespace is skipped for the same reason the official
    // emitters skip it, through their `namespaceFilter`: nearly every
    // declaration in a single-service spec lives under it, so it carries no
    // distinguishing information and only makes every key longer.
    //
    // Either way, skip just that one link in the chain and keep walking. A
    // user namespace nested under a skipped one is still collected.
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
 * A name that spells the marker itself has to be escaped, or it would read
 * back as an encoded character. Both the encoder and the pass for names
 * that need no encoding use these, so the two cannot drift apart. They did
 * drift once: the encoder escaped the marker and the other pass did not, so
 * `` `/` `` and `Sep47` claimed one key.
 */
const SEP = "Sep";

/** The marker immediately before a digit, which is what makes it ambiguous. */
const MARKER_BEFORE_DIGIT = /Sep(?=\d)/g;

/**
 * Encodes one piece of free-form text as a `components.schemas` key
 * segment.
 * Two callers use it: `sanitizeDeclarationName`, for a backtick-quoted
 * declaration name such as `` model `Foo/Bar` ``, and
 * `fallbackDeclarationName`, for the official `getTypeName` text of an
 * instantiation that has no composable structural name.
 * This encoding preserves separator characters instead of deleting them.
 * So two declaration names that differ only in their separators, such as
 * `` `user-created` `` versus `` `user_created` ``, do not collapse to the
 * same key.
 * The function splits the input on runs of non-alphanumeric characters. It
 * keeps the separator runs verbatim and capitalizes only the alphanumeric
 * segments between them.
 * A degenerate input that sanitizes to the empty string falls back to a
 * fixed non-empty token. This applies only to the empty string itself; any
 * actual separator character survives, either verbatim or as the `Sep`
 * stand-in described below. The fallback keeps the result from collapsing
 * down to nothing.
 *
 * Only `-`, `_`, and `.` are kept verbatim.
 * `refFor` already escapes `~` and `/`.
 * Every other character that is unsafe or ambiguous inside a `$ref`'s URI
 * fragment, such as `#` or a space, is encoded as `Sep<codePoint>` instead.
 * For example, `#` becomes `Sep35` and a space becomes `Sep32`. This avoids
 * passing the character through raw, and avoids collapsing every unsafe
 * character to one indistinct `Sep` token.
 * Distinct inputs stay distinguishable regardless of which unsafe
 * character they use. For example, `` `user#created` `` becomes
 * `UserSep35Created`, and `` `has space` `` becomes `HasSep32Space`.
 * The result is guaranteed never to carry a character that would make the
 * emitted `$ref` illegal or resolve to the wrong fragment.
 *
 * The alphanumeric segments, handled by the `i % 2 === 0` branch below, are
 * passed through unescaped.
 * This would let a name that spells the escape marker itself, such as
 * `` `ASep32B` ``, compose the same key as a name using the real separator
 * that marker encodes, such as `` `A B` ``.
 * That is a genuine, non-injective collision in the escaping scheme. It is
 * distinct from the narrow, accepted collisions `SchemaKeyRegistry` reports
 * as a `duplicate-schema-key` error.
 * To prevent it, any occurrence of the marker pattern itself, `Sep`
 * immediately followed by a digit, is escaped to `SepSep` before composing.
 * A payload segment can then never be mistaken for an escaped separator.
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
 * The AsyncAPI 3.0 Components Object key charset. A `components.schemas`
 * key outside this charset is not a legal member name.
 */
const SAFE_KEY_CHARSET = /^[a-zA-Z0-9.\-_]+$/;

/**
 * Tells whether `name` can be used as a Components Object key verbatim.
 * A caller that takes a key straight from the user, such as the `@message`
 * argument, uses this to warn before `sanitizeDeclarationName` rewrites the
 * text into something the user never asked for.
 */
export function isSafeComponentsKey(name: string): boolean {
  return SAFE_KEY_CHARSET.test(name);
}

/**
 * Sanitizes a named declaration's own name, e.g. `Model.name`, for use as a
 * Components Object key candidate. `components.schemas` and
 * `components.messages` share the same key charset, so both use this
 * sanitizer.
 * A plain TypeSpec identifier already lies entirely inside
 * `SAFE_KEY_CHARSET`; it is returned unchanged, case included. This keeps
 * every existing key stable.
 * A backtick-quoted name can carry arbitrary characters, e.g.
 * `` `Foo/Bar` ``. Such a name is run through `sanitizeNameSegment`, so a
 * charset-violating character never leaks into the key or the `$ref` built
 * from it.
 * An empty name is returned unchanged. This only ever occurs for an
 * anonymous type; callers already special-case that before a name is ever
 * needed.
 */
export function sanitizeDeclarationName(name: string): string {
  if (name.length === 0) {
    return name;
  }
  if (SAFE_KEY_CHARSET.test(name)) {
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
 * This name is used to build a stable `components.schemas` key for a
 * template instantiation. For example, `Envelope<Order>` becomes
 * `EnvelopeOrder`.
 * "Unspeakable" here is the same classification the official
 * `@typespec/asset-emitter` `TypeEmitter.declarationName` makes: a template
 * argument that has no fixed, nameable identity of its own makes the
 * *entire* instantiation's composed name fail.
 * Unspeakable cases are a `String`/`Number`/`Boolean` literal, a
 * `StringTemplate`, a `Tuple`, a genuine `Value`, an anonymous (unnamed)
 * `Model`, and an anonymous (unnamed) `Union`. A named `Model`/`Union`
 * argument that is itself a template instantiation propagates unspeakability
 * recursively, through the `declarationNameFor` call below.
 *
 * Unspeakable does *not* mean "nameless". The official consumers never stop
 * at `declarationName`'s `undefined`. `@typespec/openapi3`'s
 * `modelInstantiation` does `name = name ?? getOpenAPITypeName(...)`, and
 * `getOpenAPITypeName` is `getFriendlyName ?? getTypeName`, which always
 * yields text. So an unspeakable instantiation still ends up a named
 * declaration there. `fallbackDeclarationName` below provides the same
 * last-resort text for this emitter. What this emitter does differently is
 * *prefer* inlining while inlining is representable, because a
 * `getTypeName`-derived key is long and unreadable next to a compact
 * composed one.
 *
 * A genuine `Value` argument is legal wherever the template parameter is
 * constrained to a value rather than a type, for example
 * `model P<T extends valueof string>` used as `P<c>` for some `const c`. A
 * value carries no nameable identity of its own. It is the textbook
 * unspeakable case. A fixed placeholder would instead make two
 * instantiations from two different `const`s claim one key, turning valid
 * TypeSpec into a `duplicate-schema-key` error.
 *
 * A literal or enum member written directly in a template argument list,
 * such as `P<"created">`, `P<42>`, or `P<Color.Red>`, does **not** arrive
 * here as its own `Type.kind`.
 * `@typespec/compiler` 1.14.0 wraps it in an `IndeterminateEntity` instead
 * (`entityKind: "Indeterminate"`, with no top-level `kind`). The compiler
 * uses this wrapper because it has not yet decided whether the template
 * parameter is being used as a type or a value.
 * `IndeterminateEntity.type` is always one of `StringLiteral |
 * StringTemplate | NumericLiteral | BooleanLiteral | EnumMember |
 * UnionVariant | NullType`. Every one of these is a real `Type` with a
 * `kind`.
 * So unwrapping it and recursing here recovers the same handling a
 * directly-typed literal argument gets, including unspeakability for a bare
 * literal.
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
      // An anonymous `Model` has no fixed identity of its own to name the
      // instantiation after. Unspeakable.
      // Otherwise, `arg`'s own key name qualifies it. That name can itself
      // be unspeakable, when `arg` is a template instantiation with an
      // unspeakable argument, which propagates up here.
      return arg.name ? declarationNameFor(program, arg) : undefined;
    case "Scalar":
      // The name is sanitized the same way a `Model`/`Union`/`Enum`
      // argument's name is, through `declarationNameFor`. A backtick-quoted
      // scalar name can carry a character outside `SAFE_KEY_CHARSET`, and
      // that character must not reach the composed key.
      return (
        namespacePrefix(program, arg.namespace) + capitalizeFirst(sanitizeDeclarationName(arg.name))
      );
    case "Enum":
      return declarationNameFor(program, arg);
    case "EnumMember": {
      // An `Enum` is always a named declaration, so its own name is never
      // unspeakable. The guard keeps the composition type-safe without
      // relying on that invariant from another function.
      const enumName = declarationNameFor(program, arg.enum);
      return enumName === undefined ? undefined : enumName + capitalizeFirst(arg.name);
    }
    case "Union":
      // An anonymous `Union` has no fixed identity of its own. Unspeakable.
      return arg.name === undefined ? undefined : declarationNameFor(program, arg);
    case "String":
      // A literal value has no fixed identity of its own. Unspeakable.
      return undefined;
    case "StringTemplate":
      // A string template is a literal value too, whether or not the
      // compiler could reduce it to a plain string. So it is unspeakable,
      // exactly like the `String` case above and like the official
      // `TypeEmitter.declarationName`'s own default branch.
      // Naming a reduced template after its text would also contradict the
      // `String` case: `P<"abc">` and `P<"a${"b"}c">` are the same value,
      // and one of them would inline while the other registered a named
      // component.
      return undefined;
    case "Number":
      // A literal value has no fixed identity of its own. Unspeakable.
      return undefined;
    case "Boolean":
      // A literal value has no fixed identity of its own. Unspeakable.
      return undefined;
    case "Intrinsic":
      // Sanitized for the same reason the `Scalar` case above is. Every
      // built-in intrinsic name is a plain identifier, so this is a no-op
      // for them.
      return capitalizeFirst(sanitizeDeclarationName(arg.name));
    case "Tuple":
      // A tuple has no fixed identity of its own, matching the official
      // `TypeEmitter.declarationName`'s own handling of a `Tuple` argument.
      // Unspeakable.
      return undefined;
    default:
      // An unhandled argument kind, such as an `Operation` or an
      // `Interface`, has no fixed identity this function can compose a key
      // from. Unspeakable, matching the official
      // `TypeEmitter.declarationName`'s own default branch.
      // A fixed placeholder token would instead make two instantiations from
      // two different arguments of that kind claim one key, turning valid
      // TypeSpec into a `duplicate-schema-key` error. This is the same
      // reasoning the `Value` case above states.
      return undefined;
  }
}

/**
 * Builds the structural, unqualified name for a `Model`/`Union`
 * declaration.
 * For a template instantiation, the name is the template's own name plus
 * each type argument's display name. For example, `Envelope<Order>` becomes
 * `EnvelopeOrder`, and `Page<string>` becomes `PageString`. Every
 * instantiation of the same template gets its own distinguishable name up
 * front, so two instantiations of one template never compete for one key.
 * For a non-template, or an uninstantiated template declaration, this
 * function returns the plain declaration name unchanged.
 *
 * `Model` and `Union` share this function. Both support templates, and both
 * carry the same `name`/`templateMapper` shape. So a template *union*
 * instantiation, such as `Wrapper<int32>`, gets the exact same stable-key
 * treatment a template model instantiation does.
 *
 * Returns `undefined` when any template argument is itself unspeakable (see
 * `templateArgDisplayName`), matching the official
 * `TypeEmitter.declarationName`'s own behavior: the *entire* instantiation's
 * name computation fails as soon as one argument has no fixed identity to
 * name it after. This can never happen for a non-template type.
 * `undefined` here only means "no compact composed name". The type is still
 * nameable through `fallbackDeclarationName`.
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
 * Returns true for an uninstantiated template *declaration*.
 * This is the case for `Env` reached by naming it directly in source. It
 * excludes an instantiation like `Env<string>` or a defaulted use site
 * `Env`.
 * Its properties or variants are bare `TemplateParameter`s with no real
 * shape. There is nothing meaningful to build, so the caller emits the
 * unconstrained schema instead of registering a bogus key.
 * Every named declaration kind that can be a template, model or union,
 * shares this check.
 */
export function isUninstantiatedTemplateDeclaration(type: Model | Union): boolean {
  return (
    type.node !== undefined &&
    "templateParameters" in type.node &&
    type.node.templateParameters.length > 0 &&
    type.templateMapper === undefined
  );
}

/** A `$ref` pointing at `key` inside `components.schemas`. */
export function refFor(key: string): ReferenceObject {
  return { $ref: componentsSchemaRef(key) };
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
 * that has no compact composed name, that is, a template instantiation with
 * an unspeakable argument.
 * The key keeps the same shape a compact key has, namespace prefix plus own
 * name plus one segment per template argument. Only the argument segments
 * differ: each comes from the official `getEntityName`, the text
 * `@typespec/openapi3` falls back to through `getTypeName` in
 * `modelInstantiation`. For example, the argument `{x: string}` yields the
 * text `{ x: string }`.
 * That text carries characters the AsyncAPI Components Object key charset
 * forbids, such as `{` and a space, so it is Sep-encoded through
 * `sanitizeNameSegment`. `@typespec/openapi3` skips key validation for a
 * template instantiation and emits the raw text; an AsyncAPI document
 * cannot, because the key must stay a legal member name and a legal `$ref`
 * fragment.
 * Composing per argument, rather than sanitizing `getTypeName` of the whole
 * declaration, is what keeps two instantiations apart. `getTypeName` drops
 * the template arguments of a *union*, so `Chain<{a: string}>` and
 * `Chain<{b: string}>` would both reduce to `Chain` and collide.
 * The result is long and hard to read. The caller only reaches this name
 * when inlining cannot express the type, so readable output is unaffected
 * in every other case.
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
 * `components.messages` keys use it. They are deliberately not qualified by
 * namespace, unlike `components.schemas` keys, so two same-named message
 * models in different namespaces collide and the caller reports that.
 * Everything else matches how a schema key is built, and on purpose: a
 * `@friendlyName` wins outright, a template instantiation composes its
 * argument names, and an instantiation with no compact composed name falls
 * back to the same per-argument text `fallbackDeclarationName` uses.
 * Two instantiations of one template therefore get two distinct keys, the
 * same way their schemas do. Taking the raw `Model.name` instead would give
 * every instantiation the bare template name and turn valid TypeSpec into a
 * duplicate-key error.
 * The result always lies inside the Components Object key charset, and it
 * is never empty for a named declaration.
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
 * unspeakable (see `templateInstanceName`). The caller then either inlines
 * the type or, when inlining cannot express it, keys it under
 * `fallbackDeclarationName`.
 *
 * A user-applied `@friendlyName`, e.g.
 * `` @friendlyName("{name}Envelope") model Envelope<T> { ... } ``, is
 * checked first. The compiler resolves its own template-parameter
 * interpolation, e.g. `{name}`, per instantiation. That resolved name is the
 * candidate outright: it is neither namespace-qualified nor composed with
 * any structural name. An explicit friendly name is the user's own,
 * authoritative choice of key, and the official `getOpenAPITypeName` returns
 * it verbatim the same way. This holds for every kind here, model, enum, and
 * union alike.
 * Two declarations resolving to the same friendly name collide exactly like
 * any other candidate-name collision: `SchemaKeyRegistry.keyFor` reports
 * `duplicate-schema-key`. No special-casing happens here.
 *
 * With no friendly name, the candidate is the structural name qualified by
 * the declaration's own namespace chain, via `namespacePrefix`, the same
 * helper that qualifies a template *argument*'s display name. This matches
 * the official `getTypeName`/`getNamespacePrefix` default naming: two
 * same-named declarations in different namespaces resolve to different keys,
 * rather than colliding. A template instantiation is qualified too: two
 * same-named templates in sibling namespaces, instantiated with the same
 * argument, would otherwise compose one shared key.
 *
 * No further disambiguation happens here. This is exactly one candidate. It
 * is handed to `SchemaBuilder.registerNamed` (via `SchemaKeyRegistry`), which
 * decides whether that candidate is actually free.
 */
export function declarationNameFor(
  program: Program,
  type: Model | Enum | Union,
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
      // An `Enum` never has template arguments, so there is no structural
      // composition to build, only the bare declaration name. An `Enum` is
      // always a named declaration; it can never be unspeakable.
      return namespacePrefix(program, type.namespace) + sanitizeDeclarationName(type.name);
  }
}
