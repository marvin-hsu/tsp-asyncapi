import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { lowerBindings } from "../../src/lower/bindings.js";
import { lowerServers } from "../../src/lower/servers.js";
import { lowerInfo } from "../../src/lower/info.js";
import { trimmed } from "../../src/optional-fields.js";
import {
  RENDERERS,
  bindingConfig,
  bindingNode,
  bindingNodes,
  documentKey,
  infoNode,
  serverNode,
  serverNodes,
  verbatimConfig,
} from "./ir-arbitraries.js";

/**
 * Properties of the three lower-stage functions that need nothing but their
 * nodes.
 *
 * Two of them build a map keyed by a name the author wrote, and the third
 * copies a node field by field. The mistakes those shapes invite are the same
 * three every time: a section emitted empty instead of omitted, a key lost or
 * invented, and a field copied from the wrong place.
 *
 * The unit tests pin single programs. What no TypeSpec program reaches is the
 * key charset: a `@useServer` name and a binding protocol are bare strings
 * this emitter never checks, so `__proto__` and `/` both arrive. Those keys
 * decide whether building a map from entries was really necessary.
 */

const RUNS = { numRuns: 500, seed: 20260815 };

/** The own keys of an object, prototype chain excluded. */
const ownKeys = (value: object): string[] => Object.getOwnPropertyNames(value);

/** The own keys as a set, because a map states no order to its caller. */
const keySet = (value: object): Set<string> => new Set(ownKeys(value));

/** Narrows a key to the shape the document types index an extension by. */
const isExtensionKey = (key: string): key is `x-${string}` => key.startsWith("x-");

describe("Unit: lower transforms — empty in, nothing out", () => {
  it("omits the bindings and the servers section when there is no node", () => {
    let empty = 0;
    let filled = 0;

    fc.assert(
      fc.property(bindingNodes(3), serverNodes(3), (bindings, servers) => {
        if (bindings.length === 0) empty++;
        else filled++;

        const loweredBindings = lowerBindings(bindings);
        const loweredServers = lowerServers(servers);

        // An empty Bindings Object states nothing, and an empty `servers`
        // claims the application has none rather than that none were
        // declared. Both fields are omitted instead.
        if (bindings.length === 0) expect(loweredBindings).toBeUndefined();
        else expect(ownKeys(loweredBindings as object)).toHaveLength(bindings.length);

        if (servers.length === 0) expect(loweredServers).toBeUndefined();
        else expect(ownKeys(loweredServers as object)).toHaveLength(servers.length);
      }),
      RUNS,
    );

    // Both answers have their own line. A run that reached one of them would
    // leave the other untested.
    expect(empty).toBeGreaterThan(0);
    expect(filled).toBeGreaterThan(0);
  });
});

describe("Unit: lower transforms — the key set of a built map", () => {
  it("keys the bindings by protocol, with nothing added and nothing lost", () => {
    let several = 0;

    fc.assert(
      fc.property(bindingNodes(5), (nodes) => {
        if (nodes.length > 1) several++;
        const lowered = lowerBindings(nodes);
        if (nodes.length === 0) return;

        const expected = nodes.map((node) => node.protocol);
        expect(keySet(lowered as object)).toEqual(new Set(expected));
      }),
      RUNS,
    );

    // A one-node list cannot tell a dropped node from a kept one.
    expect(several).toBeGreaterThan(0);
  });

  it("keys the servers by name, with nothing added and nothing lost", () => {
    let several = 0;

    fc.assert(
      fc.property(serverNodes(5), (nodes) => {
        if (nodes.length > 1) several++;
        const lowered = lowerServers(nodes);
        if (nodes.length === 0) return;

        const expected = nodes.map((node) => node.name);
        expect(keySet(lowered as object)).toEqual(new Set(expected));

        // Each entry has to be the server of its own key, so a shifted
        // pairing is caught as well as a dropped node.
        for (const node of nodes) {
          const server = (lowered as Record<string, { host: string; protocol: string }>)[node.name];
          expect(server.host).toBe(node.host);
          expect(server.protocol).toBe(node.protocol);
        }
      }),
      RUNS,
    );

    expect(several).toBeGreaterThan(0);
  });
});

describe("Unit: lower transforms — an inherited name stays a key", () => {
  it("keeps the prototype of the built map untouched", () => {
    let inherited = 0;

    const withInheritedName = fc.oneof(
      { arbitrary: fc.constantFrom("__proto__", "constructor"), weight: 3 },
      { arbitrary: documentKey, weight: 1 },
    );

    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.tuple(withInheritedName, bindingNode, serverNode),
          // The name is what has to be unique, so it is what the selector
          // reads.
          { minLength: 1, maxLength: 3, selector: (entry) => entry[0] },
        ),
        (entries) => {
          const names = entries.map((entry) => entry[0]);
          if (names.includes("__proto__")) inherited++;

          const bindings = lowerBindings(
            entries.map((entry) => ({ ...entry[1], protocol: entry[0] })),
          ) as object;
          const servers = lowerServers(
            entries.map((entry) => ({ ...entry[2], name: entry[0] })),
          ) as object;

          for (const map of [bindings, servers]) {
            // A plain assignment of `__proto__` runs the inherited setter:
            // the entry is lost and the map's prototype is replaced.
            expect(Object.getPrototypeOf(map)).toBe(Object.prototype);
            for (const name of names) expect(Object.hasOwn(map, name)).toBe(true);
          }
        },
      ),
      RUNS,
    );

    // Without `__proto__` the property says nothing about the prototype.
    expect(inherited).toBeGreaterThan(0);
  });
});

describe("Unit: lower transforms — the binding version", () => {
  /**
   * The version table itself is not asserted against here.
   *
   * Thirteen unit files already pin their protocol's version literal, and a
   * property that compared the output with the same table the code reads
   * would assert that a lookup equals itself. What is left is the shape of
   * the rendering, which no other test states for every renderer at once:
   * `verbatim` adds nothing, every other renderer appends exactly one field,
   * and the recorded config reaches the document unchanged.
   */
  it("appends one version field as the last key, and only for a versioned renderer", () => {
    let ownVersion = 0;
    const seen = new Set<string>();

    /** A generic binding may hold a version of its own. A protocol one cannot. */
    const rendererAndConfig = fc.constantFrom(...RENDERERS).chain((renderer) =>
      (renderer === "verbatim" ? verbatimConfig : bindingConfig).map((config) => ({
        renderer,
        config,
      })),
    );

    fc.assert(
      fc.property(rendererAndConfig, documentKey, ({ renderer, config }, protocol) => {
        seen.add(renderer);
        if (Object.hasOwn(config, "bindingVersion")) ownVersion++;

        const lowered = lowerBindings([{ protocol, renderer, config }]) as Record<string, object>;
        const member = lowered[protocol];
        const keys = ownKeys(member);

        if (renderer === "verbatim") {
          // The generic `@binding` holds plain JSON. A version this emitter
          // never checked the fields against would be a claim about them.
          expect(member).toEqual(config);
          expect(keys).toEqual(ownKeys(config));
          return;
        }

        // The specification lists the version last, and every example in the
        // AsyncAPI binding repository writes it there.
        expect(keys[keys.length - 1]).toBe("bindingVersion");
        const version = (member as { bindingVersion: unknown }).bindingVersion;
        expect(typeof version).toBe("string");

        // Everything else the decorator recorded is copied as written.
        const others = keys.filter((key) => key !== "bindingVersion");
        expect(others).toEqual(ownKeys(config).filter((key) => key !== "bindingVersion"));
        for (const key of others) {
          expect((member as Record<string, unknown>)[key]).toBe(
            (config as Record<string, unknown>)[key],
          );
        }
      }),
      RUNS,
    );

    // Every renderer has its own line in the version table.
    expect(seen.size).toBe(RENDERERS.length);
    // A config that already holds a version is the case where copying it
    // through and appending one give different answers.
    expect(ownVersion).toBeGreaterThan(0);
  });
});

describe("Unit: lower transforms — the info object", () => {
  /** The fields the Info Object may hold. Nothing else may reach it. */
  const INFO_KEYS = [
    "title",
    "version",
    "description",
    "termsOfService",
    "contact",
    "license",
    "tags",
    "externalDocs",
  ];

  it("carries each field that says something, and no field the model invented", () => {
    let blank = 0;
    let absent = 0;
    let extended = 0;

    fc.assert(
      fc.property(infoNode, (node) => {
        const info = lowerInfo(node);
        const keys = ownKeys(info);

        // An `x-` key is the author's own, so the specification field list
        // cannot name it. It is checked against the model instead.
        const extensionKeys = keys.filter(isExtensionKey);
        if (extensionKeys.length > 0) extended++;
        // A map states no order to its caller, so the key sets are compared.
        expect(new Set(extensionKeys)).toEqual(new Set(Object.keys(node.extensions)));
        for (const key of extensionKeys) {
          expect(info[key]).toEqual(node.extensions[key]);
        }

        // `target` is a source location the document has no field for. A
        // whole-node spread would leak it.
        expect(keys.filter((key) => !INFO_KEYS.includes(key) && !key.startsWith("x-"))).toEqual([]);

        expect(info.title).toBe(node.title);
        expect(info.version).toBe(node.version);

        for (const field of ["description", "termsOfService"] as const) {
          const value = node[field];
          if (value === undefined) absent++;
          else if (value.trim() === "") blank++;

          // A blank field names nothing, so it takes the same answer as an
          // absent one. A field that says something is trimmed.
          expect(Object.hasOwn(info, field)).toBe(trimmed(value) !== undefined);
          if (trimmed(value) !== undefined) expect(info[field]).toBe(trimmed(value));
        }

        for (const field of ["contact", "license", "externalDocs"] as const) {
          expect(Object.hasOwn(info, field)).toBe(node[field] !== undefined);
          if (node[field] === undefined) continue;
          expect(info[field]).toEqual(node[field]);
          // The document must not alias the model. A copy is what keeps a
          // later edit of one out of the other.
          expect(info[field]).not.toBe(node[field]);
        }

        expect(Object.hasOwn(info, "tags")).toBe(node.tags.length > 0);
        if (node.tags.length > 0) expect(info.tags).toEqual(node.tags);
      }),
      RUNS,
    );

    // The blank path and the absent path are two different lines in
    // `optional-fields`, so both have to be reached.
    expect(blank).toBeGreaterThan(0);
    expect(absent).toBeGreaterThan(0);
    // An empty extension map emits no field at all, so the populated case
    // has to be reached for the check above to mean anything.
    expect(extended).toBeGreaterThan(0);
  });
});
