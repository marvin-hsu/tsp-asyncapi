import { describe, it, expect } from "vitest";
import { lowerDocument } from "#emitter/lower/document.js";
import { unusedProgram } from "../../../utils/program.js";

/**
 * The assembly stage never touches the program. It only forwards it to the
 * schema builder, and the empty service below declares nothing to build.
 * The stub program refuses every read, so this claim is checked, not stated.
 */
const stubProgram = unusedProgram();

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
    // AsyncAPI requires both fields. An omitted `channels` is an invalid
    // document, so an empty model still emits an empty map for each.
    const document = lowerDocument(stubProgram, EMPTY_SERVICE, {});

    expect(document.channels).toEqual({});
    expect(document.operations).toEqual({});
  });

  /**
   * Root prose options go through `text`, the same as every other prose
   * field of the document. A blank value becomes absent, and the rest is
   * trimmed. The options schema sets no minimum length, so an author can
   * write blank or padded whitespace, and both are exercised here.
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
