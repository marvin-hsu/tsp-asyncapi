import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Program } from "@typespec/compiler";

import { lowerDocument } from "../../src/lower/document.js";
import { resolvesInDocument } from "../../src/lower/json-pointer.js";
import { ASYNCAPI_VERSION } from "../../src/constants.js";
import { trimmed } from "../../src/optional-fields.js";
import type { AsyncAPIEmitterOptions } from "../../src/lib.js";
import { infoNode, requiredText, service } from "./ir-arbitraries.js";

/**
 * Properties of the document assembly.
 *
 * `lowerDocument` is the entry of the lower half. It decides which section
 * reaches the document, which one is emitted empty because the specification
 * requires it, and how the emitter options reach the head. Each section's own
 * transformation is tested in `lower-transforms.test.ts`; this file only tests
 * what happens between them.
 *
 * The input is a hand-written semantic model, which is the first thing the
 * three-stage pipeline was meant to buy. `document.test.ts` also checks whole
 * documents, but its models come out of a real compilation, so their shape is
 * limited by the TypeSpec grammar. A hand-written model reaches the
 * combinations resolve cannot produce: far more operations than channels, or
 * every section empty at once.
 *
 * The program is a stub. It is used for schema expansion and for reporting,
 * and neither happens here: every message carries a raw payload, so nothing
 * walks a type, and no check on that path reports.
 */

/** A program no assertion in this file lets the emitter reach. */
const stubProgram = {} as unknown as Program;

const RUNS = { numRuns: 300, seed: 20260815 };

/** The own keys of an object, prototype chain excluded. */
const ownKeys = (value: object): string[] => Object.getOwnPropertyNames(value);

/**
 * Reads a section the specification requires.
 *
 * The document type states `channels` and `operations` as optional, so the
 * required-ness is a rule of the assembly rather than of the type. The
 * assertion here is what makes the read safe.
 */
function requiredSection<T>(section: Record<string, T> | undefined): Record<string, T> {
  // The assertion is the check. The fallback only satisfies the type, and an
  // absent section never reaches it.
  expect(section).toBeDefined();
  return section ?? {};
}

/** The own keys as a set, because a map states no order to its caller. */
const keySet = (value: object): Set<string> => new Set(ownKeys(value));

/**
 * A model whose sections reach both extremes.
 *
 * The plain generator lets each section length fall to zero on its own, and an
 * all-empty draw is then rare enough to miss in three hundred runs. The two
 * forced arms make the both-extremes cases ordinary.
 */
const shapedService = fc.oneof(
  { arbitrary: service(0), weight: 6 },
  { arbitrary: service(1), weight: 2 },
  {
    arbitrary: infoNode.map((info) => ({
      info,
      servers: [],
      securitySchemes: [],
      messages: [],
      messageKeys: new Map(),
      channels: [],
      operations: [],
    })),
    weight: 2,
  },
);

/** The empty service: every section a model can leave empty, left empty. */
const EMPTY_SERVICE = {
  info: { title: "T", version: "1", tags: [], extensions: {} },
  servers: [],
  securitySchemes: [],
  messages: [],
  messageKeys: new Map(),
  channels: [],
  operations: [],
};

describe("Integration: document assembly — a section exists when the model has one", () => {
  it("mirrors the model, and omits an empty components section", () => {
    let allEmpty = 0;
    let allFilled = 0;

    fc.assert(
      fc.property(shapedService, (model) => {
        const sections = [
          model.servers.length,
          model.securitySchemes.length,
          model.messages.length,
          model.channels.length,
        ];
        if (sections.every((length) => length === 0)) allEmpty++;
        if (sections.every((length) => length > 0)) allFilled++;

        const document = lowerDocument(stubProgram, model, {});

        expect(Object.hasOwn(document, "servers")).toBe(model.servers.length > 0);
        if (model.servers.length > 0) {
          expect(ownKeys(document.servers as object)).toHaveLength(model.servers.length);
        }

        // No message carries a model payload here, so nothing claims a
        // `components.schemas` key and the section holds two entries at most.
        const hasComponents = model.messages.length > 0 || model.securitySchemes.length > 0;
        expect(Object.hasOwn(document, "components")).toBe(hasComponents);
        if (!hasComponents) return;

        const components = document.components as object;
        // An empty `components` states nothing, and the baseline snapshots
        // pin its absence.
        expect(ownKeys(components).length).toBeGreaterThan(0);
        expect(Object.hasOwn(components, "messages")).toBe(model.messages.length > 0);
        expect(Object.hasOwn(components, "securitySchemes")).toBe(model.securitySchemes.length > 0);
        expect(Object.hasOwn(components, "schemas")).toBe(false);
      }),
      RUNS,
    );

    // The omission decisions only run on an empty section, and the mirroring
    // only means something on a filled one.
    expect(allEmpty).toBeGreaterThan(0);
    expect(allFilled).toBeGreaterThan(0);
  });
});

describe("Integration: document assembly — the two required sections", () => {
  it("emits channels and operations even when the model has none", () => {
    // AsyncAPI states both fields as required. An omitted `channels` is an
    // invalid document, so the empty map is emitted instead. "None" is a
    // single point, so it is stated; the counts over drawn models are the
    // keying property below, which pins the keys and with them the counts.
    const document = lowerDocument(stubProgram, EMPTY_SERVICE, {});

    expect(document.channels).toEqual({});
    expect(document.operations).toEqual({});
  });
});

describe("Integration: document assembly — every reference an operation writes", () => {
  it("resolves each operation reference in the document it was written into", () => {
    let escaped = 0;
    let replies = 0;
    let messageRefs = 0;

    fc.assert(
      fc.property(service(1), (model) => {
        if (model.channels.some((channel) => /[~/]/.test(channel.key))) escaped++;

        const document = lowerDocument(stubProgram, model, {});

        for (const operation of Object.values(requiredSection(document.operations))) {
          expect(resolvesInDocument(document, operation.channel.$ref)).toBe(true);
          for (const reference of operation.messages ?? []) {
            messageRefs++;
            expect(resolvesInDocument(document, reference.$ref)).toBe(true);
          }
          if (operation.reply === undefined) continue;
          replies++;
          expect(resolvesInDocument(document, operation.reply.channel.$ref)).toBe(true);
          for (const reference of operation.reply.messages ?? []) {
            expect(resolvesInDocument(document, reference.$ref)).toBe(true);
          }
        }
      }),
      RUNS,
    );

    // A key with no `~` and no `/` is copied into the pointer untouched, so
    // escaping it or not gives the same answer.
    expect(escaped).toBeGreaterThan(0);
    // A reply writes two more references, and a message reference walks two
    // tokens instead of one.
    expect(replies).toBeGreaterThan(0);
    expect(messageRefs).toBeGreaterThan(0);
  });
});

describe("Integration: document assembly — nothing is dropped or merged", () => {
  it("keys each channel and each operation by the key its node carries", () => {
    let manyOperations = 0;

    fc.assert(
      fc.property(shapedService, (model) => {
        // Resolve produces at most one operation per declared operation, so a
        // model with more operations than channels is what a hand-written one
        // adds.
        if (model.operations.length > model.channels.length) manyOperations++;

        const document = lowerDocument(stubProgram, model, {});

        const channels = requiredSection(document.channels);
        const operations = requiredSection(document.operations);
        expect(keySet(channels)).toEqual(new Set(model.channels.map((node) => node.key)));
        expect(keySet(operations)).toEqual(new Set(model.operations.map((node) => node.key)));

        for (const node of model.operations) {
          expect(operations[node.key].action).toBe(node.action);
        }
        for (const node of model.channels) {
          expect(channels[node.key].address).toBe(node.address);
        }
      }),
      RUNS,
    );

    expect(manyOperations).toBeGreaterThan(0);
  });
});

describe("Integration: document assembly — the options that reach the head", () => {
  /** The three states of one option: absent, set, or blank. */
  const optionValue = fc.oneof(
    { arbitrary: fc.constant(undefined), weight: 2 },
    { arbitrary: requiredText, weight: 3 },
  );

  it("writes an option field when the option has a value, and never otherwise", () => {
    let bothSet = 0;
    let neitherSet = 0;

    fc.assert(
      fc.property(shapedService, optionValue, optionValue, (model, id, contentType) => {
        const options: AsyncAPIEmitterOptions = {
          ...(id === undefined ? {} : { "asyncapi-id": id }),
          ...(contentType === undefined ? {} : { "default-content-type": contentType }),
        };
        if (id !== undefined && contentType !== undefined) bothSet++;
        if (id === undefined && contentType === undefined) neitherSet++;

        const document = lowerDocument(stubProgram, model, options);

        // The version is the emitter's own claim, never an option.
        expect(document.asyncapi).toBe(ASYNCAPI_VERSION);

        // An option answers to the rule every other text field answers to:
        // a blank one is absent, and one that says something is trimmed.
        expect(Object.hasOwn(document, "id")).toBe(trimmed(id) !== undefined);
        if (trimmed(id) !== undefined) expect(document.id).toBe(trimmed(id));

        expect(Object.hasOwn(document, "defaultContentType")).toBe(
          trimmed(contentType) !== undefined,
        );
        if (trimmed(contentType) !== undefined) {
          expect(document.defaultContentType).toBe(trimmed(contentType));
        }

        // `output-file` and `file-type` name the artifact, not the document.
        expect(Object.hasOwn(document, "output-file")).toBe(false);
        expect(Object.hasOwn(document, "file-type")).toBe(false);
      }),
      RUNS,
    );

    // Each field has its own conditional, so both have to be exercised in
    // both directions.
    expect(bothSet).toBeGreaterThan(0);
    expect(neitherSet).toBeGreaterThan(0);
  });

  /**
   * The two head options skip the rule the rest of the document follows.
   *
   * Both conditions used to be a plain truthiness test, so
   * `asyncapi-id: "   "` reached the document as `id: "   "` and
   * `asyncapi-id: "  x  "` kept its padding. Every prose field of the
   * document goes through `text`, which answers a blank as absent and trims
   * the rest, and the two options now go through it as well. The options
   * schema sets no minimum length, so an author can write either one.
   */
  it.each([
    { option: " ", id: undefined },
    { option: "   ", id: undefined },
    { option: "\t", id: undefined },
    { option: "  x  ", id: "x" },
  ])("treats the blank or padded option %j the way it treats blank prose", ({ option, id }) => {
    // The four spellings were the whole pool of a property that sampled them
    // a hundred times. Blank and padded are the two ways an option carries
    // whitespace, and the corpus case `blank-root-options` pins the same rule
    // end to end.
    const document = lowerDocument(stubProgram, EMPTY_SERVICE, { "asyncapi-id": option });
    expect(document.id).toBe(id);
  });
});
