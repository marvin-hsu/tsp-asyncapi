/**
 * The AsyncAPI document object tree.
 *
 * `document.ts` holds the objects the lower stage writes. The rest come from
 * `tsp-asyncapi-core`, and this file re-exports them.
 *
 * The re-export is deliberate, and it has a limit. This package's public API
 * describes the document it emits, completely. `ChannelObject` carries `tags`,
 * and a caller reading a lowered document should not need a second dependency
 * to name the type of that field. The same holds for every protocol binding
 * object, because a lowered channel carries them.
 *
 * What this package does not re-export is the other half of core's API: the
 * readers for decorator state, and the state types. Those describe the input
 * language, not this document. A tool that reads what the author declared
 * depends on `tsp-asyncapi-core` directly.
 */

export * from "./document.js";
export * from "tsp-asyncapi-core/types";
