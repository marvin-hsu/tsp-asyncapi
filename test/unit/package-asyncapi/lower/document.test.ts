import { describe, it, expect } from "vitest";
import type { Program } from "@typespec/compiler";
import { lowerDocument } from "#emitter/lower/document.js";

/**
 * The assembly stage never touches the program; it only forwards it to the
 * schema builder, and the empty service below declares nothing to build.
 */
const stubProgram = {} as unknown as Program;

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

describe("Unit: assembling the head of the document", () => {
  it("emits channels and operations even when the model has none", () => {
    // AsyncAPI states both fields as required. An omitted `channels` is an
    // invalid document, so the empty map is emitted instead. "None" is a
    // single point, so it is stated; the counts over drawn models are the
    // keying property in `test/property-based/document-assembly.test.ts`,
    // which pins the keys and with them the counts.
    const document = lowerDocument(stubProgram, EMPTY_SERVICE, {});

    expect(document.channels).toEqual({});
    expect(document.operations).toEqual({});
  });

  /**
   * Both root options used to be a plain truthiness test, so
   * `asyncapi-id: "   "` reached the document as `id: "   "` and
   * `asyncapi-id: "  x  "` kept its padding. Every prose field of the
   * document goes through `text`, which answers a blank as absent and trims
   * the rest, and the two options now go through it as well. The options
   * schema sets no minimum length, so an author can write either one.
   *
   * Blank and padded are the two ways an option carries whitespace, so the
   * four spellings are written out. The value-or-absent dichotomy over drawn
   * text stays a property in `test/property-based/document-assembly.test.ts`,
   * and the corpus case `blank-root-options` pins the same rule end to end.
   */
  it.each([
    { option: " ", id: undefined },
    { option: "   ", id: undefined },
    { option: "\t", id: undefined },
    { option: "  x  ", id: "x" },
  ])("treats the blank or padded option %j the way it treats blank prose", ({ option, id }) => {
    const document = lowerDocument(stubProgram, EMPTY_SERVICE, { "asyncapi-id": option });
    expect(document.id).toBe(id);
  });
});
