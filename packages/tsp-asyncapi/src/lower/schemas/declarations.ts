/**
 * Which types earn a `components.schemas` entry, and what each one is keyed
 * as.
 *
 * This is the state that makes a schema key an output of the walk rather
 * than a property of the type. Three mechanisms live here and nowhere else:
 *
 * - **Promote on second use.** An unspeakable declaration is written in
 *   place the first time it is reached, and promoted to a component the
 *   second time. So a type earns a key only once something uses it twice.
 * - **The self-reference fallback.** A declaration that re-enters itself
 *   while being inlined claims a key part way through its own build.
 * - **Release on failure.** A build that then throws hands that key back,
 *   so no `$ref` points at a component that never arrives.
 *
 * Because of those three, resolve cannot assign schema keys ahead of the
 * walk. Every other kind of key in this emitter is fixed by one declaration
 * and is assigned in resolve.
 *
 * The registry never builds a schema. Each entry point takes the build as a
 * callback, so the shape builders stay in `schemas.ts` and this file stays
 * about identity.
 */

import { Enum, Model, Program, Type, Union } from "@typespec/compiler";
import { SchemaObject, ReferenceObject } from "../../types/index.js";
import { refFor } from "../json-pointer.js";
import { reportDiagnostic } from "tsp-asyncapi-core";
import { SchemaKeyRegistry } from "./key-registration.js";

/**
 * The declarations one document build collected.
 * @internal
 */
export class DeclarationRegistry {
  public constructor(private readonly program: Program) {
    this.keyRegistry = new SchemaKeyRegistry(program);
  }

  // Maps the final `components.schemas` key to its built schema.
  // Entries stay in the order each declaration was first successfully
  // built.
  private readonly declaredSchemas = new Map<string, SchemaObject>();

  private readonly keyRegistry: SchemaKeyRegistry;

  // Keyed by the type itself, model, enum, or named union, rather than a
  // narrower type. This lets every kind of named declaration share one
  // registry, and with it, one circular-reference guard.
  private readonly building = new Set<Type>();

  // Maps a type whose declaration has already been built and pushed into
  // `declaredSchemas` to its final `components.schemas` key.
  // This is distinct from merely having claimed a key; see
  // `schemaKeys`/`claimedBy` below.
  private readonly declaredTypes = new Map<Type, string>();

  /**
   * Tracks a named declaration that re-entered itself while being inlined.
   * `buildNamedDeclaration` reads it to decide that the inline attempt must
   * be redone as a registered declaration.
   */
  private readonly selfReferencingInlines = new Set<Type>();

  /**
   * Caches the built shape of an unspeakable declaration that inlines.
   * A registered declaration is cached by `declaredTypes` instead, and
   * resolves to a `$ref`. An inlined one has no key to resolve to, so its
   * whole shape is kept here and returned to every later reference site.
   * This keeps the body built exactly once, however many sites reference it.
   */
  private readonly inlinedShapes = new Map<Type, SchemaObject>();

  /**
   * Holds every declaration that `buildDeclarationRef` marked. Such a
   * declaration always registers as a component. It never inlines.
   */
  private readonly forcedDeclarations = new Set<Type>();

  /**
   * Queues the subtypes of a model whose schema carries `discriminator`.
   * `getSchemas` drains the queue. Draining it there, rather than during the
   * base model's own build, keeps the base's entry ahead of its subtypes' in
   * `declaredSchemas`, and keeps the queue out of the recursive build.
   */
  private readonly pendingSubtypes: Model[] = [];

  /**
   * Queues every subtype of `model`, direct and indirect.
   * The walk is transitive because only the model that carries
   * `@discriminator` queues anything. In a three-level hierarchy the middle
   * level usually carries no decorator of its own, so it would never queue
   * the bottom level.
   */
  private enqueueSubtypes(model: Model): void {
    for (const derived of model.derivedModels) {
      this.pendingSubtypes.push(derived);
      this.enqueueSubtypes(derived);
    }
  }

  /**
   * Builds the schema for a *named* `Model` or `Union`, choosing between a
   * registered `components.schemas` entry and an inline shape.
   *
   * A declaration with a compact composed name, such as `Order` or
   * `Envelope<Order>`, always registers. This is the common case.
   *
   * A declaration with no compact composed name is "unspeakable": a
   * template instantiation with a type argument that has no fixed identity
   * of its own to name it after (an anonymous `Model`/`Union`, a literal, a
   * `Tuple`, a value, ... see `templateArgDisplayName`). Such a declaration
   * inlines by preference. `SchemaKeyRegistry` can still key it, through
   * `fallbackDeclarationName`, but that key is long and unreadable, so
   * inlining gives the better document.
   *
   * Inlining cannot express a self-reference. `Node<{x: string}>` with a
   * `children: Node<T>[]` property re-enters itself, and expanding one more
   * level always leaves another self-reference behind. So a re-entry while
   * inlining marks the type and returns a `$ref` to its fallback key. The
   * outer frame sees the mark, discards the inline shape, and registers the
   * declaration instead. Every reference then resolves to one real
   * component.
   * The discarded inline shape is not rebuilt. Its nested self-references
   * already resolved to a `$ref` at this type's fallback key, the same key
   * the registration claims. So that shape is registered directly as the
   * component body.
   * Building it a second time would repeat every diagnostic the first
   * attempt reported. Codes such as `unsupported-payload-type` are
   * deliberately not deduped, so the user would see one mistake reported
   * twice.
   * A later reference to the same promoted declaration returns the cached
   * `$ref` through the `declaredTypes` check below. So the body is built
   * exactly once however many sites reference it.
   */
  private buildNamedDeclaration(
    type: Model | Union,
    build: () => SchemaObject,
  ): SchemaObject | ReferenceObject {
    // An already-declared type resolves straight to its `$ref`. This
    // mirrors `registerNamed`'s own `declaredTypes` guard, and it is what
    // makes a promoted, unspeakable declaration build exactly once no matter
    // how many sites reference it. Without it, a second reference finds
    // `nameFor` still `undefined` and `building` no longer holding the type,
    // so it would re-enter the inline path and rebuild the whole body.
    const declared = this.declaredTypes.get(type);
    if (declared !== undefined) {
      return refFor(declared);
    }
    // A second reference to an unspeakable declaration that already inlined
    // promotes it to a registered component, and every reference from here
    // on resolves to a `$ref` through the `declaredTypes` check above.
    //
    // Inlining is preferred for a single use: the shape reads better in
    // place than behind a long, generated fallback key. But inlining copies
    // the whole shape into every site that uses it. Nested unspeakable
    // declarations then duplicate multiplicatively. A chain where each level
    // references the level below twice emits 2^depth copies of the innermost
    // shape: measured at 1.1 MB for a 12-level chain, and 17 MB at 16
    // levels, from about 20 lines of TypeSpec. Promoting on the second use
    // keeps that growth linear.
    //
    // The already-built shape is registered as the component body rather
    // than rebuilt. Rebuilding would report every diagnostic of the first
    // build a second time; codes such as `unsupported-payload-type` are
    // deliberately not deduped.
    //
    // The site that took the first reference keeps its inline copy. Only
    // that site holds it, and the emitted schema is the same shape either
    // way, so the document stays correct. Converting it after the fact is
    // not possible: a property that adds its own documentation or validation
    // spreads the shape into a fresh object (see `withPropertyDocs`), so
    // that site holds a copy rather than the cached object.
    const inlinedShape = this.inlinedShapes.get(type);
    if (inlinedShape !== undefined) {
      this.inlinedShapes.delete(type);
      const promotedKey = this.keyRegistry.keyFor(type);
      this.declaredTypes.set(type, promotedKey);

      // The site that met this type first holds the body itself, and holds
      // the very object below. The component takes a copy, and the original
      // is rewritten in place into a reference, which turns that first site
      // into a reference as well. Without the rewrite the body is emitted
      // twice, once as a component and once expanded at the first site, and
      // which site keeps the expansion depends on the order the sources are
      // declared in. The two copies can then drift, and a reader has no sign
      // they are the same shape.
      const body: SchemaObject = { ...inlinedShape };
      this.declaredSchemas.set(promotedKey, body);
      // Emptying the object keeps the identity the first site holds, which
      // is the whole point: assigning a new object would leave that site
      // pointing at the old body.
      for (const key of Object.keys(inlinedShape)) {
        Reflect.deleteProperty(inlinedShape, key);
      }
      Object.assign(inlinedShape, refFor(promotedKey));

      return refFor(promotedKey);
    }
    // The name is asked of `SchemaKeyRegistry`, which memoizes it, so the
    // registration that follows reuses this same computation instead of
    // walking the template argument chain a second time.
    if (this.forcedDeclarations.has(type) || this.keyRegistry.nameFor(type) !== undefined) {
      return this.registerNamed(type, build);
    }
    if (this.building.has(type)) {
      this.selfReferencingInlines.add(type);
      return refFor(this.keyRegistry.keyFor(type));
    }
    this.building.add(type);
    let inlined: SchemaObject;
    try {
      inlined = build();
    } catch (error) {
      // A self-reference reached while `build` was running claimed this
      // type's fallback key from `keyRegistry` (see the branch above). The
      // build then failed, so nothing will ever be registered under that
      // key. Release it, exactly as `registerNamed` does in its own `catch`,
      // so a retry or another reference does not resolve to a `$ref`
      // pointing at a component that never exists.
      this.keyRegistry.release(type);
      this.selfReferencingInlines.delete(type);
      throw error;
    } finally {
      this.building.delete(type);
    }
    if (!this.selfReferencingInlines.has(type)) {
      this.inlinedShapes.set(type, inlined);
      return inlined;
    }
    // Register the shape already in hand instead of rebuilding it. See this
    // method's doc comment: a second `build` would report every diagnostic
    // of the first one again.
    const key = this.keyRegistry.keyFor(type);
    this.declaredTypes.set(type, key);
    this.declaredSchemas.set(key, inlined);
    return refFor(key);
  }

  /**
   * Builds the schema for an anonymous (unnamed) `Model` or `Union`, guarded
   * against a self-referencing cycle.
   * An anonymous type has no `components.schemas` key, so it always inlines
   * instead of going through `registerNamed`'s `$ref`-and-cache path. That
   * path is also where the `building` Set's circular-reference guard lives.
   * An anonymous type on its own bypassed that guard entirely.
   * A named model can only reference itself indirectly, through a property.
   * A named model requires a name. But TypeSpec's `alias` construct can
   * still produce a self-referencing anonymous `Model`, for example
   * `alias Foo = { a: Foo };`. `alias` only expands its right-hand side; it
   * does not need or create a name for it. Building that shape recurses
   * forever and crashes with a stack overflow, since there is no cached
   * `$ref` to return once the cycle is detected.
   * A plain (non-`$ref`) schema cannot express a self-referencing cycle at
   * all: expanding one more level always leaves another self-reference
   * behind. So this guard cannot return a correct expansion once a cycle is
   * detected. It reports `unrepresentable-circular-reference` and degrades
   * to `{}` instead, matching how `unsupported-payload-type` degrades an
   * unrepresentable case elsewhere in this class.
   */
  private buildAnonymousGuarded(type: Model | Union, build: () => SchemaObject): SchemaObject {
    if (this.building.has(type)) {
      reportDiagnostic(this.program, {
        code: "unrepresentable-circular-reference",
        target: type,
      });
      return {};
    }
    this.building.add(type);
    try {
      return build();
    } finally {
      this.building.delete(type);
    }
  }

  /**
   * Registers `type` under a fresh `components.schemas` key on first use.
   * Returns a `$ref` to it.
   * `build` computes the schema body.
   * A repeat call for the same type returns the same `$ref` without
   * recomputing. This includes a call reached while `build` for it is
   * still running, that is, a circular reference.
   * Every named declaration kind, model, enum, or named union, shares this
   * one method. So the register/$ref/circular-guard logic lives in exactly
   * one place.
   */
  private registerNamed(type: Model | Enum | Union, build: () => SchemaObject): ReferenceObject {
    const key = this.keyRegistry.keyFor(type);
    if (this.declaredTypes.has(type) || this.building.has(type)) {
      return refFor(key);
    }
    this.building.add(type);
    try {
      const value = build();
      this.declaredTypes.set(type, key);
      // Only the type that actually owns the key writes the body. `keyFor`
      // reports `duplicate-schema-key` when a different type already owns
      // it, and both types keep returning a `$ref` to that one key. Writing
      // here regardless would let whichever type is built last overwrite the
      // owner's body, so every `$ref` to the key would then resolve to a
      // schema describing the wrong type. Keeping the owner's body means the
      // reported error is the only damage.
      if (this.keyRegistry.ownerOf(key) === type) {
        this.declaredSchemas.set(key, value);
      }
    } catch (error) {
      // `build()` failed. Release the key this type claimed. Otherwise, a
      // retry, or another reference to the same type, would see
      // `this.building` no longer containing it and no declaration present,
      // and return a `$ref` pointing at a component that will never exist.
      this.keyRegistry.release(type);
      throw error;
    } finally {
      this.building.delete(type);
    }
    return refFor(key);
  }

  /** Every built declaration, keyed as it will appear in the document. */
  public entries(): ReadonlyMap<string, SchemaObject> {
    return this.declaredSchemas;
  }

  /** Records the schema of a derived key, such as a message payload. */
  public setSchema(key: string, schema: SchemaObject): void {
    this.declaredSchemas.set(key, schema);
  }

  /** The type that owns one key, or `undefined` when no type claimed it. */
  public keyOwner(key: string): Type | undefined {
    return this.keyRegistry.ownerOf(key);
  }

  /** The key a model would claim, without claiming it and without building. */
  public keyCandidate(model: Model): string {
    return this.keyRegistry.candidateFor(model);
  }

  /** The key a model claims. Registers it on first use. */
  public keyFor(model: Model): string {
    return this.keyRegistry.keyFor(model);
  }

  /** Claims a key derived from another, such as `<model>Payload`. */
  public claimDerived(key: string, owner: Model): boolean {
    return this.keyRegistry.claimDerived(key, owner);
  }

  /**
   * Marks a model as one that must register rather than inline.
   *
   * A caller that needs a `$ref` uses this. Without it an unspeakable model
   * reached for the first time would be written in place, and the caller
   * would have no key to point at.
   */
  public force(model: Model): void {
    this.forcedDeclarations.add(model);
  }

  /**
   * Takes the next subtype waiting to be declared, or `undefined` when the
   * queue is empty.
   *
   * The caller builds it. The registry holds the queue but never walks a
   * type graph itself.
   */
  public nextPendingSubtype(): Model | undefined {
    return this.pendingSubtypes.shift();
  }

  /** Queues every subtype of one model, direct and indirect. */
  public queueSubtypes(model: Model): void {
    this.enqueueSubtypes(model);
  }

  /** Declares a named `Model` or `Union`, inlining it when it has no key. */
  public declareNamed(
    type: Model | Union,
    build: () => SchemaObject,
  ): SchemaObject | ReferenceObject {
    return this.buildNamedDeclaration(type, build);
  }

  /** Guards an anonymous declaration against re-entering itself. */
  public guardAnonymous(type: Model | Union, build: () => SchemaObject): SchemaObject {
    return this.buildAnonymousGuarded(type, build);
  }

  /** Registers a declaration under its key and returns a reference to it. */
  public register(type: Model | Enum | Union, build: () => SchemaObject): ReferenceObject {
    return this.registerNamed(type, build);
  }
}
