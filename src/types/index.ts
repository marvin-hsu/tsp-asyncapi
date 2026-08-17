/**
 * The AsyncAPI document types.
 *
 * The core objects and the protocol bindings are two families that grow at
 * different rates, so they sit in two files. Everything that reads a document
 * type imports it from here, so the split stays an implementation detail of
 * this folder.
 */

export * from "./document.js";
export * from "./bindings.js";
