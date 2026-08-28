import fc from "fast-check";
import { resolveRef } from "../utils/json-pointer.js";

/**
 * A shared generator and renderer for an `extends` chain of models.
 *
 * Two properties drive the same shape through the emitter: whether every
 * declared property is still described, and whether declared optionality
 * survived. Both need the same generator, normalizer, and renderer, so this
 * module holds the one copy instead of two.
 *
 * The two properties differ only in their name pool. The optionality
 * property adds the pair `a`/`aw`, letting two TypeSpec names claim one wire
 * name. The coverage property leaves that pair out, so its wire names stay
 * unique by construction. `ChainConfig` carries that one difference.
 */

/** One property as the generator declared it, before any emitting. */
export interface PropDecl {
  name: string;
  optional: boolean;
  never: boolean;
  encoded: boolean;
}

/** One model in the `extends` chain, as the generator declared it. */
export interface LevelDecl {
  props: PropDecl[];
  spread: boolean;
}

/** The two properties `...Mix` spreads in. */
const MIX_PROPS: readonly PropDecl[] = [
  { name: "m0", optional: false, never: false, encoded: false },
  { name: "m1", optional: true, never: false, encoded: false },
];

/** What one caller wants that the other does not. */
export interface ChainConfig {
  /**
   * The property names the generator draws from. A name may be repeated to
   * give it more weight.
   */
  namePool: readonly string[];
  /**
   * The TypeSpec type expression for each drawn name. The type is fixed per
   * name, not per declaration. TypeSpec rejects an override whose type is not
   * assignable to the ancestor's. Such a program is thrown away by the error
   * filter instead of testing anything.
   */
  nameType: Readonly<Record<string, string>>;
  /**
   * Forces the `@encodedName` flag for the named properties. Any name absent
   * from this record keeps the flag the generator drew. Forcing the flag is
   * what makes a wire-name collision reachable often enough to test.
   */
  encodedOverride?: Readonly<Partial<Record<string, boolean>>>;
  /**
   * When true, a second declaration of one wire name on one level is
   * dropped. The compiler rejects that program with its own
   * `encoded-name-conflict` error, so no document is emitted at all. A
   * caller whose name pool cannot produce the clash leaves this off.
   */
  guardWireNames?: boolean;
}

/** The generator, normalizer, and renderer for one `ChainConfig`. */
export interface ChainHarness {
  /** One whole program: the chain, and whether its root carries an indexer. */
  chainArb: fc.Arbitrary<{ levels: LevelDecl[]; useIndexer: boolean }>;
  normalize(levels: readonly LevelDecl[]): LevelDecl[];
  render(levels: readonly LevelDecl[], useIndexer: boolean): string;
}

/** The wire name one declaration claims. */
export function wireOf(prop: PropDecl): string {
  return prop.encoded ? prop.name + "w" : prop.name;
}

/**
 * The declaration that wins for each TypeSpec name.
 *
 * The walk goes from the most-derived level to the base, and the first
 * record for a name wins. That is TypeSpec's override precedence.
 * `never`-typed winners are dropped. They contribute no key.
 *
 * This reads the generator's own records. It never consults the compiler, so
 * it stays independent of the code under test.
 */
export function winners(levels: readonly LevelDecl[]): PropDecl[] {
  const winner = new Map<string, PropDecl>();
  for (const level of [...levels].reverse()) {
    for (const prop of level.props) {
      if (!winner.has(prop.name)) {
        winner.set(prop.name, prop);
      }
    }
  }
  return [...winner.values()].filter((prop) => !prop.never);
}

/** What a reader sees after resolving one schema. */
export interface Resolved {
  /** Each `required` array met, kept separate so duplicates stay visible. */
  requiredArrays: string[][];
  /** Every key described under some `properties`. */
  described: Set<string>;
}

/**
 * Walks `schema` the way a reader does, and collects what it describes and
 * what it demands.
 *
 * A reader resolves `allOf` as a conjunction and follows every `$ref`. So a
 * key described by any branch is described by the schema, and a key required
 * by any branch is required by the schema. `seen` guards a reference cycle.
 * Each branch gets its own copy of it. That way one branch cannot hide a
 * reference another branch also uses.
 *
 * @param doc - The emitted document, used to resolve every `$ref`
 * @param schema - The schema node to walk
 * @returns The described keys and the `required` arrays met on the way
 */
export function resolveSchema(doc: unknown, schema: unknown): Resolved {
  const out: Resolved = { requiredArrays: [], described: new Set() };
  walk(doc, schema, new Set(), out);
  return out;
}

function walk(doc: unknown, schema: unknown, seen: Set<string>, out: Resolved): void {
  if (schema === null || typeof schema !== "object") {
    return;
  }
  const node = schema as Record<string, unknown>;
  if (typeof node.$ref === "string") {
    if (seen.has(node.$ref)) return;
    seen.add(node.$ref);
    walk(doc, resolveRef(doc, node.$ref), seen, out);
    return;
  }
  if (Array.isArray(node.allOf)) {
    for (const branch of node.allOf) {
      walk(doc, branch, new Set(seen), out);
    }
  }
  if (Array.isArray(node.required)) {
    out.requiredArrays.push(node.required.map(String));
  }
  if (node.properties !== null && typeof node.properties === "object") {
    for (const key of Object.keys(node.properties)) {
      out.described.add(key);
    }
  }
}

/**
 * Builds the generator, normalizer, and renderer for one name pool.
 *
 * @param config - The two callers' one difference, described above
 * @returns The three pieces both properties need
 */
export function createChainHarness(config: ChainConfig): ChainHarness {
  const encodedOverride = config.encodedOverride ?? {};

  const rawProp = fc.record({
    name: fc.constantFrom(...config.namePool),
    optional: fc.boolean(),
    never: fc.boolean(),
    encoded: fc.boolean(),
  });

  const rawLevel = fc.record({
    props: fc.array(rawProp, { minLength: 0, maxLength: 3 }),
    spread: fc.boolean(),
  });

  const chainArb = fc.record({
    levels: fc.array(rawLevel, { minLength: 2, maxLength: 4 }),
    useIndexer: fc.boolean(),
  });

  /**
   * Applies the forced flags to one raw draw.
   *
   * A `never` property is forced to be required and unencoded. It
   * contributes no key either way. Varying those two flags would only add
   * draws that cannot change the outcome.
   */
  function settle(raw: PropDecl): PropDecl {
    const forced = encodedOverride[raw.name];
    const encoded = forced ?? raw.encoded;
    return {
      name: raw.name,
      optional: raw.never ? false : raw.optional,
      never: raw.never,
      encoded: raw.never ? false : encoded,
    };
  }

  /**
   * Normalizes one level's raw draw into a declaration record.
   *
   * Shapes TypeSpec itself rejects are dropped, because a rejected program
   * tests nothing. A name may appear only once per level. A name already
   * declared `never` further up the chain is not redeclared, since a
   * concrete type is not assignable to `never`. `neverNames` carries that
   * state across levels, and this function adds to it. With
   * `guardWireNames` on, a wire name may also appear only once per level.
   */
  function normalizeLevel(level: LevelDecl, neverNames: Set<string>): LevelDecl {
    const seenNames = new Set<string>();
    const seenWire = new Set<string>();
    const props: PropDecl[] = [];
    if (level.spread) {
      for (const mix of MIX_PROPS) {
        props.push(mix);
        seenNames.add(mix.name);
        seenWire.add(mix.name);
      }
    }
    for (const raw of level.props) {
      if (seenNames.has(raw.name) || neverNames.has(raw.name)) {
        continue;
      }
      const prop = settle(raw);
      if (config.guardWireNames === true && !prop.never && seenWire.has(wireOf(prop))) {
        continue;
      }
      seenNames.add(prop.name);
      seenWire.add(wireOf(prop));
      props.push(prop);
      if (prop.never) {
        neverNames.add(prop.name);
      }
    }
    return { props, spread: level.spread };
  }

  /** Normalizes the whole chain, base level first. */
  function normalize(levels: readonly LevelDecl[]): LevelDecl[] {
    const neverNames = new Set<string>();
    return levels.map((level) => normalizeLevel(level, neverNames));
  }

  /** The TypeSpec type expression for one declared property. */
  function typeOf(prop: PropDecl, useIndexer: boolean): string {
    if (prop.never) {
      return "never";
    }
    // An indexer forces every property type to `string`, so each one stays
    // assignable to the indexer's value type.
    return useIndexer ? "string" : config.nameType[prop.name];
  }

  /** Renders one model of the chain as TypeSpec source. */
  function renderLevel(level: LevelDecl, index: number, useIndexer: boolean): string {
    const head =
      index === 0 ? "model M0 {" : `model M${String(index)} extends M${String(index - 1)} {`;
    const body: string[] = [];
    // An indexer on the root of the chain. It reaches the merge
    // `buildFlattenedObjectSchema` does between an inherited
    // `additionalProperties` and the rebuilt property set.
    if (index === 0 && useIndexer) {
      body.push("...Record<string>;");
    }
    if (level.spread) {
      body.push("...Mix;");
    }
    for (const prop of level.props) {
      // The spread already wrote these two. They are in `props` so the
      // expected set can see them, not so they are declared twice.
      if (prop.name === "m0" || prop.name === "m1") {
        continue;
      }
      const encoded = prop.encoded ? `@encodedName("application/json", "${prop.name}w") ` : "";
      body.push(`${encoded}${prop.name}${prop.optional ? "?" : ""}: ${typeOf(prop, useIndexer)};`);
    }
    return `${head} ${body.join(" ")} }`;
  }

  /** Renders the declaration records as a whole TypeSpec program. */
  function render(levels: readonly LevelDecl[], useIndexer: boolean): string {
    const lines = ["model Mix { m0: string; m1?: string; }"];
    levels.forEach((level, index) => lines.push(renderLevel(level, index, useIndexer)));
    lines.push(`@AsyncAPI.message model Root { r: M${String(levels.length - 1)}; }`);
    return lines.join("\n");
  }

  return { chainArb, normalize, render };
}
