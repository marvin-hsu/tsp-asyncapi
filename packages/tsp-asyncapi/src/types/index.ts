/**
 * The AsyncAPI document object tree.
 *
 * `document.ts` holds the objects the lower stage writes. The rest re-export
 * from `tsp-asyncapi-core`.
 *
 * This package's public API describes the emitted document in full. A caller
 * should not need a second dependency to name `ChannelObject`, `tags`, or any
 * protocol binding object a lowered channel carries.
 *
 * Decorator-state readers and state types stay in `tsp-asyncapi-core`. They
 * describe the input language, not the emitted document.
 */

export * from "./document.js";
export * from "tsp-asyncapi-core/types";
