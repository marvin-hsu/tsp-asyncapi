import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { lowerDocument } from "#emitter/lower/document.js";
import { resolvesInDocument } from "#emitter/lower/json-pointer.js";
import { ASYNCAPI_VERSION } from "#core/constants.js";
import type { AsyncAPIEmitterOptions } from "#emitter/emitter-options.js";
import { infoNode, service } from "./ir-arbitraries.js";
import { unusedProgram } from "../utils/program.js";

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
const stubProgram = unusedProgram();

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

        // No message carries a model payload here, so no model claims a
        // `components.schemas` key.
        const mustHave = model.messages.length > 0 || model.securitySchemes.length > 0;
        // A tag or an external documentation link anywhere in the document
        // can also open the section. Whether it does is the promotion rule,
        // and that rule is stated in its own suites. What holds without
        // restating it: a document carrying none of them has no `components`.
        const sites = [model.info, ...model.servers, ...model.channels, ...model.operations];
        const canHave =
          mustHave || sites.some((site) => site.tags.length > 0 || site.externalDocs !== undefined);
        if (mustHave) expect(Object.hasOwn(document, "components")).toBe(true);
        if (!canHave) expect(Object.hasOwn(document, "components")).toBe(false);
        if (!Object.hasOwn(document, "components")) return;

        const components = document.components as object;
        // An empty `components` states nothing, and the baseline snapshots
        // pin its absence.
        expect(ownKeys(components).length).toBeGreaterThan(0);
        expect(Object.hasOwn(components, "messages")).toBe(model.messages.length > 0);
        expect(Object.hasOwn(components, "securitySchemes")).toBe(model.securitySchemes.length > 0);
        // A raw schema two messages share does claim a key, so `schemas` can
        // appear without any model payload. The rule that decides which raw
        // schemas share is stated once, in
        // `test/unit/package-asyncapi/messages/raw-schema-sharing.test.ts`.
        // Restating it here would assert that the code does what the code
        // does. What holds without restating it: no raw schema anywhere means
        // no `schemas` section.
        const anyRaw = model.messages.some(
          (message) => message.payload.kind === "raw" || message.headers.kind === "raw",
        );
        if (!anyRaw) expect(Object.hasOwn(components, "schemas")).toBe(false);
      }),
      RUNS,
    );

    // The omission decisions only run on an empty section, and the mirroring
    // only means something on a filled one.
    expect(allEmpty).toBeGreaterThan(0);
    expect(allFilled).toBeGreaterThan(0);
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
  /**
   * Text with nothing `trim` would strip, so it is already its own trimmed
   * form. The `minLength` and the equality together rule out a blank string:
   * a whitespace-only draw trims to empty and fails the comparison.
   */
  const coreText = fc.string({ minLength: 1 }).filter((value) => value === value.trim());

  /**
   * Only characters `trim` strips, written as escapes so that none of them is
   * invisible in this file. The non-ASCII three are here because `trim` takes
   * every Unicode space and line terminator, not only the ASCII five, and an
   * implementation that hand-rolled the set would keep them.
   */
  const padding = fc.string({
    unit: fc.constantFrom(" ", "\t", "\n", "\r", "\f", "\v", "\u00a0", "\u2028", "\ufeff"),
    maxLength: 3,
  });

  /** One option, drawn together with the answer it must produce. */
  interface OptionDraw {
    readonly input: string | undefined;
    readonly expected: string | undefined;
  }

  /**
   * Draws an option and its answer at the same time.
   *
   * Asking `trimmed` for the expected value would have stated the rule by
   * running the function that implements it, so the input is built out of the
   * answer instead: a core with nothing to strip, wrapped in padding that is
   * nothing but strippable characters. The core is the trimmed form by
   * construction, and no assertion below consults the module it checks.
   *
   * Two of the three states an option can be in are single points -- absent,
   * and blank in each of its spellings -- and both are written out in
   * `test/unit/package-asyncapi/lower/document.test.ts`, which owns them. What
   * is left for a property, and reachable only here, is arbitrary text.
   */
  const optionDraw = fc.oneof(
    { arbitrary: fc.constant<OptionDraw>({ input: undefined, expected: undefined }), weight: 2 },
    {
      arbitrary: fc.tuple(padding, coreText, padding).map(([before, core, after]): OptionDraw => ({
        input: `${before}${core}${after}`,
        expected: core,
      })),
      weight: 3,
    },
  );

  it("writes an option field trimmed when it carries text, and never otherwise", () => {
    let bothSet = 0;
    let neitherSet = 0;
    let paddedDraws = 0;

    fc.assert(
      fc.property(shapedService, optionDraw, optionDraw, (model, id, contentType) => {
        const options: AsyncAPIEmitterOptions = {
          ...(id.input === undefined ? {} : { "asyncapi-id": id.input }),
          ...(contentType.input === undefined ? {} : { "default-content-type": contentType.input }),
        };
        if (id.input !== undefined && contentType.input !== undefined) bothSet++;
        if (id.input === undefined && contentType.input === undefined) neitherSet++;
        for (const draw of [id, contentType]) {
          if (draw.input !== draw.expected) paddedDraws++;
        }

        const document = lowerDocument(stubProgram, model, options);

        // The version is the emitter's own claim, never an option.
        expect(document.asyncapi).toBe(ASYNCAPI_VERSION);

        // An option answers to the rule every other text field answers to:
        // it reaches the document trimmed, or it does not reach it.
        expect(Object.hasOwn(document, "id")).toBe(id.expected !== undefined);
        if (id.expected !== undefined) expect(document.id).toBe(id.expected);

        expect(Object.hasOwn(document, "defaultContentType")).toBe(
          contentType.expected !== undefined,
        );
        if (contentType.expected !== undefined) {
          expect(document.defaultContentType).toBe(contentType.expected);
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

    // The padding is constructed, so this counter is not hoping for it. It is
    // here because the trimming half of the rule is unchecked on any run where
    // every draw arrives already trimmed, and a later edit to `padding` could
    // make that every run without failing anything else.
    expect(paddedDraws).toBeGreaterThan(0);
  });
});
