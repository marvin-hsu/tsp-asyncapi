/**
 * The document object types the input language accepts.
 *
 * Both files here are vocabulary a decorator takes as a value. `authored.ts`
 * holds the objects the author writes for a whole value, such as a security
 * scheme or a message example. `bindings.ts` holds every protocol binding, and
 * each one is the declared shape of a binding decorator.
 *
 * The rest of the AsyncAPI document tree is not here. Those objects are
 * written by an emitter, and each emitter declares its own.
 */

export * from "./authored.js";
export * from "./bindings.js";
