import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { lowerBindings } from "#emitter/lower/bindings.js";
import { lowerServers } from "#emitter/lower/servers.js";
import { lowerInfo } from "#emitter/lower/info.js";
import { bindingNodes, infoNode, requiredText, serverNodes } from "./ir-arbitraries.js";

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

/**
 * An optional text field paired with the answer it must produce.
 *
 * Reading the answer from `trimmed` would make the property compare the
 * module against the helper it is built on: `lowerInfo` calls `text`, which
 * calls `trimmed`, so an oracle that calls `trimmed` too moves whenever the
 * blank rule moves. The answer is carried alongside the input instead, so
 * nothing here states the rule.
 *
 * The rule itself is enumerated in `test/unit/optional-fields.test.ts`. What
 * this pairing is for is the field wiring: that `lowerInfo` applies the rule
 * at all, to the fields it is meant to apply it to.
 */
const labelledText = fc.oneof(
  // Text that already says something: the answer is the text.
  {
    arbitrary: requiredText.map((written) => ({ written, answer: written.trim() })),
    weight: 3,
  },
  // Padded text: the answer is the body inside the padding.
  {
    arbitrary: fc
      .tuple(
        fc.constantFrom("", " ", "  ", "\t"),
        fc.stringMatching(/^[a-z]{1,8}$/),
        fc.constantFrom("", " ", "\n "),
      )
      .map(([before, body, after]) => ({ written: `${before}${body}${after}`, answer: body })),
    weight: 2,
  },
  // Blank text names nothing, so the field is absent.
  {
    arbitrary: fc.constantFrom(" ", "   ", "\t", "\n  ").map((written) => ({
      written,
      answer: undefined,
    })),
    weight: 1,
  },
  // No field at all.
  { arbitrary: fc.constant({ written: undefined, answer: undefined }), weight: 2 },
);

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
      fc.property(infoNode, labelledText, labelledText, (drawn, description, termsOfService) => {
        // The two optional text fields carry their own expected answers, so
        // the assertions below never restate the blank rule.
        const node = {
          ...drawn,
          description: description.written,
          termsOfService: termsOfService.written,
        };
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

        for (const [field, drawnField] of [
          ["description", description],
          ["termsOfService", termsOfService],
        ] as const) {
          if (drawnField.written === undefined) absent++;
          else if (drawnField.answer === undefined) blank++;

          // A blank field names nothing, so it takes the same answer as an
          // absent one.
          expect(Object.hasOwn(info, field)).toBe(drawnField.answer !== undefined);
          if (drawnField.answer !== undefined) expect(info[field]).toBe(drawnField.answer);
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
