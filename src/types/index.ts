/**
 * The AsyncAPI document types.
 *
 * Everything that reads a document type imports it from here, so the split
 * into three files stays an implementation detail of this folder.
 *
 * The three files divide by who depends on them, not by subject:
 *
 * - `authored.ts` holds the objects the author writes directly. A decorator
 *   takes each one as a value, so the input language depends on them.
 * - `document.ts` holds the rest of the document tree. The lower stage writes
 *   those, and nothing else refers to them.
 * - `bindings.ts` holds the protocol bindings. Every one of them is the
 *   declared shape of a binding decorator, so the input language depends on
 *   the whole file.
 */

export * from "./authored.js";
export * from "./document.js";
export * from "./bindings.js";
