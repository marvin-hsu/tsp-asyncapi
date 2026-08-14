import {
  Type,
  Model,
  Enum,
  Union,
  Namespace,
  Value,
  IndeterminateEntity,
} from "@typespec/compiler";
import { ReferenceObject } from "../../types/index.js";
import {
  isGlobalTypeSpecNamespace,
  ANONYMOUS_MODEL_NAME_TOKEN,
  ANONYMOUS_UNION_NAME_TOKEN,
} from "../../constants.js";

/**
 * Escapes a `components.schemas` key for use as a JSON Pointer token inside
 * a `$ref`.
 * Per RFC 6901, `~` becomes `~0` and `/` becomes `~1`.
 * A model or namespace identifier can contain arbitrary characters through
 * backquoting. A raw `/` or `~` would otherwise produce a `$ref` that every
 * conforming resolver misreads as a path through nested objects.
 * The key stored in `this.schemas` is left unescaped. Only the `$ref` string
 * needs this escaping.
 */
function toJsonPointerToken(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}

/** Upper-cases just the first character, leaving the rest of `text` as-is. */
function capitalizeFirst(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

/**
 * Builds a capitalized, dot-free concatenation of a namespace chain.
 * For example, `A.B` becomes `"AB"`.
 * This prefixes a `Model`/`Union` template argument's display name with its
 * namespace. Two same-named models in different namespaces then compose
 * different template-instantiation names instead of colliding.
 * The global namespace's name is `""`. So an argument with no namespace
 * yields `""`. Every pre-existing instantiation name with no namespace is
 * unaffected.
 */
function namespacePrefix(namespace: Namespace | undefined): string {
  const parts: string[] = [];
  let ns = namespace;
  while (ns?.name) {
    // The compiler's built-in `TypeSpec` namespace is home to `Array`,
    // `Record`, and the other built-in collection types.
    // It sits directly under the global namespace
    // (`ns.namespace?.name === ""`).
    // It is not a user namespace. So it should not leak into a synthesized
    // key the way a real user namespace does.
    // Skip just this one link in the chain and keep walking. A user
    // namespace nested under it, if that were even possible, would still be
    // collected.
    if (isGlobalTypeSpecNamespace(ns)) {
      ns = ns.namespace;
      continue;
    }
    parts.unshift(capitalizeFirst(ns.name));
    ns = ns.namespace;
  }
  // The parts are joined with `.`, not concatenated bare.
  // `.` is legal in the AsyncAPI Components Object key charset,
  // `^[a-zA-Z0-9\.\-_]+$`.
  // A bare join is not injective: namespace `A.B` and a sibling top-level
  // namespace `AB` would otherwise both produce the prefix `"AB"`.
  // This still leaves one narrower, accepted collision.
  // `sanitizeLiteralDisplayName` keeps `.` verbatim in a literal argument's
  // own text. So a literal containing `.` can compose the same name as an
  // unrelated namespaced argument, for example `P<"a.b">` versus a model
  // named `B` inside `namespace PA`.
  // This rare case is left to `findFreeKey`'s suffix ladder, like the other
  // rare, documented collisions in this file. Introducing a second reserved
  // marker is not worth it: both call sites already treat `.` as a safe
  // passthrough character.
  return parts.join(".");
}

/**
 * Builds a human-legible display name for a literal template argument's
 * value.
 * This name preserves separator characters instead of deleting them.
 * So distinct literals that differ only in their separators, such as
 * `"user-created"` versus `"user_created"`, do not collapse to the same
 * composed name.
 * The function splits the input on runs of non-alphanumeric characters. It
 * keeps the separator runs verbatim and capitalizes only the alphanumeric
 * segments between them.
 * A degenerate input that sanitizes to the empty string falls back to a
 * fixed non-empty token. This applies only to the empty string itself; any
 * actual separator character survives, either verbatim or as the `Sep`
 * stand-in described below. The fallback keeps the composed name from
 * collapsing down to the bare template name.
 *
 * Only `-`, `_`, and `.` are kept verbatim.
 * `refFor`/`toJsonPointerToken` already escape `~` and `/`.
 * Every other character that is unsafe or ambiguous inside a `$ref`'s URI
 * fragment, such as `#` or a space, is encoded as `Sep<codePoint>` instead.
 * For example, `#` becomes `Sep35` and a space becomes `Sep32`. This avoids
 * passing the character through raw, and avoids collapsing every unsafe
 * character to one indistinct `Sep` token.
 * Distinct literals stay distinguishable regardless of which unsafe
 * separator character they use. For example, `"user#created"` becomes
 * `UserSep35Created`, and `"has space"` becomes `HasSep32Space`.
 * The composed name is guaranteed never to carry a character that would
 * make the emitted `$ref` illegal or resolve to the wrong fragment.
 *
 * The alphanumeric segments, handled by the `i % 2 === 0` branch below, are
 * passed through unescaped.
 * This would let a literal that spells the escape marker itself, such as
 * `"ASep32B"`, compose the same name as a literal using the real separator
 * that marker encodes, such as `"A B"`.
 * That is a genuine, non-injective collision in the escaping scheme. It is
 * distinct from the intentional, accepted collisions `findFreeKey` already
 * handles.
 * To prevent it, any occurrence of the marker pattern itself, `Sep`
 * immediately followed by a digit, is escaped to `SepSep` before composing.
 * A literal payload can then never be mistaken for an escaped separator.
 */
function sanitizeLiteralDisplayName(raw: string): string {
  if (raw.length === 0) {
    return "Empty";
  }
  const parts = raw.split(/([^\dA-Za-z]+)/);
  const out = parts
    .map((part, i) => {
      if (i % 2 === 0) {
        return capitalizeFirst(part.replace(/Sep(?=\d)/g, "SepSep"));
      }
      if (/^[-_.]+$/.test(part)) {
        return part;
      }
      return Array.from(part)
        .map((ch) => `Sep${String(ch.codePointAt(0) ?? 0)}`)
        .join("");
    })
    .join("");
  return out.length === 0 ? "Empty" : out;
}

/**
 * Builds a human-legible display name for a numeric template argument's
 * value.
 * This name encodes its sign and decimal point instead of deleting them.
 * So `-1` and `1`, and likewise `1.5` and `15`, do not collapse to the same
 * composed name.
 *
 * The name is built from the compiler's `NumericLiteral.valueAsString`, the
 * literal's original source text, rather than from `String(value)`.
 * `String()` round-trips through a JS `number`. That round-trip is lossy for
 * values outside the safe integer/precision range. For very large or very
 * small magnitudes it also renders in exponent notation with a `+`, such as
 * `1e+21`. The AsyncAPI 3.0 Components Object key charset,
 * `^[a-zA-Z0-9\.\-_]+$`, forbids `+`. An unescaped `+` would otherwise leak
 * into the `components.schemas` key and the emitted `$ref`.
 * Any character the source text can still carry that is not already
 * handled, in particular a `+` from a source-level exponent sign, is
 * Sep-encoded the same way `sanitizeLiteralDisplayName` encodes unsafe
 * separators. This keeps the composed name from ever carrying a
 * charset-violating character.
 */
function sanitizeNumberDisplayName(valueAsString: string): string {
  const text = valueAsString;
  const negative = text.startsWith("-");
  const magnitudeText = (negative ? text.slice(1) : text).replaceAll(".", "_");
  const magnitude = Array.from(magnitudeText)
    .map((ch) => (/\w/.test(ch) ? ch : `Sep${String(ch.codePointAt(0) ?? 0)}`))
    .join("");
  return capitalizeFirst(negative ? `Neg${magnitude}` : magnitude);
}

/**
 * Builds a structural display name for an anonymous, unnamed `Model`
 * template argument.
 * The name is derived from its own properties' names *and* types, instead
 * of the fixed `"Anonymous"` token.
 * For example, `{x: string}` becomes `AnonymousXString`, and
 * `{x: string, y: int32}` becomes `AnonymousXStringYInt32`.
 * The name comes entirely from the argument's own properties, in their own
 * declaration order. It never depends on the position of the field that
 * references it. So the same anonymous-model argument always composes the
 * same key, no matter which field of the enclosing model declares it or in
 * what order.
 * Each property's type is included, not just its name. So two anonymous
 * models that share property names but differ in property types, such as
 * `{x: string}` versus `{x: int32}`, do not compose the same base name.
 * They instead fall into `findFreeKey`'s order-dependent numeric-suffix
 * ladder.
 * A property-less anonymous model, `{}`, falls back to the bare
 * `"Anonymous"` token. Any resulting collision is a genuine one, left to
 * `findFreeKey`.
 *
 * Each property's own name is run through `sanitizeLiteralDisplayName`, not
 * `capitalizeFirst`. `capitalizeFirst` passes everything but the first
 * character through verbatim. A backtick-quoted property name can carry
 * arbitrary characters. Inserting one unescaped would leak a character
 * outside the AsyncAPI Components Object key charset into the composed
 * name. `sanitizeLiteralDisplayName` already closes this exact leak for a
 * literal template argument's own text.
 *
 * Two syntactically distinct anonymous models with identical property
 * names and types are still two separate `Model` objects. They register two
 * separate, byte-identical components under `findFreeKey`'s numeric-suffix
 * ladder. This is not wrong output, just an accepted duplication.
 * Deduplicating structurally-identical anonymous instantiations is a
 * possible future refactor. This function does not attempt it.
 */
function anonymousModelDisplayName(model: Model): string {
  const names = [...model.properties.values()].map(
    (property) => sanitizeLiteralDisplayName(property.name) + templateArgDisplayName(property.type),
  );
  return ANONYMOUS_MODEL_NAME_TOKEN + names.join("");
}

/**
 * Builds a structural display name for an anonymous, unnamed `Union`
 * template argument.
 * The name is derived from its own variants' display names, instead of the
 * fixed `"Union"` token.
 * For example, `string | int32` becomes `UnionStringInt32`.
 * The name comes entirely from the union's own variants, in their own
 * declaration order. It never depends on the position of the field that
 * references it. So the same anonymous-union argument always composes the
 * same key, no matter which field of the enclosing model declares it or in
 * what order.
 * A variant-less union, impossible in practice, falls back to the bare
 * `"Union"` token. Any resulting collision is a genuine one, left to
 * `findFreeKey`.
 */
function anonymousUnionDisplayName(union: Union): string {
  const names = [...union.variants.values()].map((variant) => templateArgDisplayName(variant.type));
  return ANONYMOUS_UNION_NAME_TOKEN + names.join("");
}

/**
 * Builds a short, human-legible name for one template argument.
 * This name is used to build a stable `components.schemas` key for a
 * template instantiation. For example, `Envelope<Order>` becomes
 * `EnvelopeOrder`.
 * Only `Type` arguments have a meaningful display name.
 * A genuine `Value` argument is legal wherever the template parameter is
 * constrained to a value rather than a type. It has no name of its own
 * worth surfacing, so it falls back to a fixed placeholder. Collisions
 * coming from that placeholder are handled the same way any other name
 * collision is, by `findFreeKey`'s qualified-name/suffix ladder.
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
 * So unwrapping it and recursing here recovers the same meaningful name a
 * directly-typed literal argument gets. Without this unwrap, the
 * overwhelmingly common case of a literal or enum-member template argument
 * would collapse to the "Value" placeholder instead.
 */
function templateArgDisplayName(arg: Type | Value | IndeterminateEntity): string {
  if ("entityKind" in arg && arg.entityKind === "Indeterminate") {
    return templateArgDisplayName(arg.type);
  }
  if (!("kind" in arg)) {
    return "Value";
  }
  switch (arg.kind) {
    case "Model":
      return arg.name
        ? namespacePrefix(arg.namespace) + templateInstanceName(arg)
        : anonymousModelDisplayName(arg);
    case "Scalar":
      return namespacePrefix(arg.namespace) + capitalizeFirst(arg.name);
    case "Enum":
      return namespacePrefix(arg.namespace) + arg.name;
    case "EnumMember":
      return namespacePrefix(arg.enum.namespace) + arg.enum.name + capitalizeFirst(arg.name);
    case "Union":
      return arg.name !== undefined
        ? namespacePrefix(arg.namespace) + templateInstanceName(arg)
        : anonymousUnionDisplayName(arg);
    case "String":
      return sanitizeLiteralDisplayName(arg.value);
    case "StringTemplate":
      // `stringValue` is set whenever the compiler could reduce the whole
      // template to a plain string at check time. This happens when there
      // is no interpolation, or when every interpolated part is itself a
      // literal. Treat that case exactly like a `StringLiteral`.
      // Otherwise, compose the name from `spans`. A literal span's own text
      // goes through the same sanitizer a `StringLiteral` argument gets.
      // An interpolated span is recursed into, so its own display name
      // contributes, whatever `Type` it turns out to be.
      // Without this, every unreduced string-template argument would fall
      // to the shared `Unhandled${arg.kind}` fallback below, and they would
      // all collide with each other.
      if (arg.stringValue !== undefined) {
        return sanitizeLiteralDisplayName(arg.stringValue);
      }
      return arg.spans
        .map((span) =>
          span.isInterpolated
            ? templateArgDisplayName(span.type)
            : sanitizeLiteralDisplayName(span.type.value),
        )
        .join("");
    case "Number":
      return sanitizeNumberDisplayName(arg.valueAsString);
    case "Boolean":
      return arg.value ? "True" : "False";
    case "Intrinsic":
      return capitalizeFirst(arg.name);
    case "Tuple":
      return "Tuple" + arg.values.map((value) => templateArgDisplayName(value)).join("");
    default:
      // This fallback token is one no handled case can produce.
      // It is distinct, in particular, from `Intrinsic`'s legitimate
      // `"Unknown"` for `unknown`.
      // So an unhandled argument kind never collides with a real type.
      return `Unhandled${arg.kind}`;
  }
}

/**
 * Builds a stable `components.schemas` key base for a template
 * instantiation.
 * The key is built from the template's own name plus each type argument's
 * display name. For example, `Envelope<Order>` becomes `EnvelopeOrder`, and
 * `Page<string>` becomes `PageString`.
 * This is the long-term naming strategy for a template instantiation. It
 * replaces the short-name-collides-so-fall-back-to-qualified-name ladder as
 * the *first* candidate specifically for a template instantiation.
 * Every instantiation of the same template already gets its own
 * distinguishable name up front. So the qualified-name/numeric-suffix
 * ladder in `findFreeKey` is only ever reached here for a genuine further
 * collision, such as two unrelated templates that happen to produce the
 * same composed name. It is not reached for the routine case of two
 * instantiations of the same template.
 * For a non-template, or an uninstantiated template declaration, this
 * function returns the plain declaration name unchanged. That path never
 * reaches registration anyway.
 *
 * `Model` and `Union` share this function. Both support templates, and both
 * carry the same `name`/`templateMapper` shape. So a template *union*
 * instantiation, such as `Wrapper<int32>`, gets the exact same stable-key
 * treatment a template model instantiation does. It does not fall back to
 * the traversal-order-dependent short-name-plus-suffix ladder.
 */
function templateInstanceName(type: Model | Union): string {
  const mapper = type.templateMapper;
  if (mapper === undefined || mapper.args.length === 0) {
    return type.name ?? "";
  }
  return (type.name ?? "") + mapper.args.map(templateArgDisplayName).join("");
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
  return { $ref: `#/components/schemas/${toJsonPointerToken(key)}` };
}

/**
 * Computes the `components.schemas` key candidate for a named declaration:
 * a model, enum, or named union.
 * This is a bare name, or, for a template instantiation, the name already
 * composed with its type arguments' own names and namespaces (see
 * `templateInstanceName`).
 * No further disambiguation happens here. This is exactly one candidate. It
 * is handed to `SchemaBuilder.registerNamed`, which decides whether that
 * candidate is actually free.
 */
export function declarationNameFor(type: Model | Enum | Union): string {
  switch (type.kind) {
    case "Model":
    case "Union":
      return templateInstanceName(type);
    case "Enum":
      return type.name;
  }
}
