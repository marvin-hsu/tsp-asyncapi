/**
 * Which types earn a `components.schemas` entry, and what each one is keyed
 * as.
 *
 * A schema key is an output of the walk rather than a fixed property of the
 * type, because of three mechanisms that live only here:
 *
 * - **Promote on second use.** An unspeakable declaration is written in
 *   place the first time it is reached, and promoted to a component the
 *   second time.
 * - **The self-reference fallback.** A declaration that re-enters itself
 *   while being inlined claims a key part way through its own build.
 * - **Release on failure.** A build that then throws hands that key back,
 *   so no `$ref` points at a component that never arrives.
 *
 * Every other kind of key in this emitter is fixed by one declaration and
 * assigned in resolve.
 *
 * The registry never builds a schema. Each entry point takes the build as a
 * callback, so the shape builders stay in `schemas.ts` and this file stays
 * about identity.
 */

import { Enum, Model, Program, Scalar, Type, Union } from "@typespec/compiler";
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
   *
   * A `Set`, so a subtype queued twice is built once. A three-level
   * hierarchy where two levels carry `@discriminator` queues the bottom
   * level from each of them. Insertion order is kept, so the subtypes are
   * still declared in the order they were reached.
   */
  private readonly pendingSubtypes = new Set<Model>();

  /**
   * Queues every subtype of `model`, direct and indirect.
   * The walk is transitive because only the model that carries
   * `@discriminator` queues anything. In a three-level hierarchy the middle
   * level usually carries no decorator of its own, so it would never queue
   * the bottom level.
   */
  private enqueueSubtypes(model: Model): void {
    for (const derived of model.derivedModels) {
      this.pendingSubtypes.add(derived);
      this.enqueueSubtypes(derived);
    }
  }

  /**
   * Builds the schema for a *named* `Model` or `Union`, choosing between a
   * registered `components.schemas` entry and an inline shape.
   *
   * A declaration with a compact composed name, such as `Order` or
   * `Envelope<Order>`, always registers; this is the common case. A
   * declaration with no compact name is "unspeakable": a template
   * instantiation whose type argument has no fixed identity to name it
   * after (see `templateArgDisplayName`). Such a declaration inlines by
   * preference, since its fallback key is long and unreadable.
   *
   * Inlining cannot express a self-reference: `Node<{x: string}>` with a
   * `children: Node<T>[]` property re-enters itself, and expanding one more
   * level always leaves another self-reference behind. A re-entry while
   * inlining marks the type and returns a `$ref` to its fallback key. The
   * outer frame sees the mark, discards the inline shape, and registers the
   * already-built shape as the component body instead of rebuilding it.
   * Rebuilding would repeat every diagnostic the first attempt reported,
   * since codes such as `unsupported-payload-type` are not deduped.
   */
  private buildNamedDeclaration(
    type: Model | Union,
    build: () => SchemaObject,
  ): SchemaObject | ReferenceObject {
    // An already-declared type resolves straight to its `$ref`. This is what
    // makes a promoted, unspeakable declaration build exactly once no matter
    // how many sites reference it.
    const declared = this.declaredTypes.get(type);
    if (declared !== undefined) {
      return refFor(declared);
    }
    // A second reference to an unspeakable declaration that already inlined
    // promotes it to a registered component.
    //
    // Inlining reads better for a single use, but it copies the whole shape
    // into every site that uses it. Nested unspeakable declarations then
    // duplicate multiplicatively: a chain where each level references the
    // level below twice emits 2^depth copies of the innermost shape,
    // measured at 1.1 MB for a 12-level chain and 17 MB at 16 levels, from
    // about 20 lines of TypeSpec. Promoting on the second use keeps that
    // growth linear.
    //
    // The already-built shape becomes the component body rather than being
    // rebuilt, since rebuilding would report every diagnostic of the first
    // build a second time.
    const inlinedShape = this.inlinedShapes.get(type);
    if (inlinedShape !== undefined) {
      this.inlinedShapes.delete(type);
      const promotedKey = this.keyRegistry.keyFor(type);
      this.declaredTypes.set(type, promotedKey);

      // The first site holds `inlinedShape` itself. The component takes a
      // copy, and the original is rewritten in place into a reference, so
      // that first site becomes a reference too. Without the rewrite, the
      // body is emitted twice and the two copies can drift apart.
      const body: SchemaObject = { ...inlinedShape };
      this.declaredSchemas.set(promotedKey, body);
      // Emptying the object keeps the identity the first site holds instead
      // of pointing it at a new object.
      for (const key of Object.keys(inlinedShape)) {
        Reflect.deleteProperty(inlinedShape, key);
      }
      Object.assign(inlinedShape, refFor(promotedKey));

      return refFor(promotedKey);
    }
    // `SchemaKeyRegistry` memoizes the name, so this reuses the computation
    // the registration below performs instead of walking the template
    // argument chain twice.
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
      // type's fallback key (see the branch above). Release it, so a retry
      // or another reference does not resolve to a `$ref` pointing at a
      // component that never exists.
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
    // Register the shape already in hand instead of rebuilding it, which
    // would report every diagnostic of the first build again.
    const key = this.keyRegistry.keyFor(type);
    this.declaredTypes.set(type, key);
    this.declaredSchemas.set(key, inlined);
    return refFor(key);
  }

  /**
   * Builds the schema for an anonymous (unnamed) `Model` or `Union`, guarded
   * against a self-referencing cycle.
   *
   * An anonymous type has no `components.schemas` key, so it always inlines
   * and bypasses `registerNamed`'s `$ref`-and-cache circular-reference
   * guard. TypeSpec's `alias` construct can still produce a self-referencing
   * anonymous `Model`, for example `alias Foo = { a: Foo };`, which would
   * otherwise recurse forever with no cached `$ref` to stop it.
   *
   * A plain schema cannot express a self-referencing cycle: expanding one
   * more level always leaves another self-reference behind. So this guard
   * reports `unrepresentable-circular-reference` and degrades to `{}`
   * instead, once a cycle is detected.
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
   * Registers `type` under a fresh `components.schemas` key on first use,
   * and returns a `$ref` to it. `build` computes the schema body.
   *
   * A repeat call for the same type returns the same `$ref` without
   * recomputing, including a call reached while `build` is still running,
   * that is, a circular reference. Every named declaration kind, model,
   * enum, or named union, shares this one method.
   */
  private registerNamed(
    type: Model | Enum | Scalar | Union,
    build: () => SchemaObject,
  ): ReferenceObject {
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

  /** Claims a key derived from another, such as `<model>Payload`. */
  public claimDerived(key: string, owner: Model, cause?: "payload" | "raw"): boolean {
    return this.keyRegistry.claimDerived(key, owner, cause);
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
    const next = this.pendingSubtypes.values().next();
    if (next.done) {
      return undefined;
    }
    this.pendingSubtypes.delete(next.value);
    return next.value;
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
  public register(type: Model | Enum | Scalar | Union, build: () => SchemaObject): ReferenceObject {
    return this.registerNamed(type, build);
  }
}
