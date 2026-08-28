import type { DiagnosticTarget, Model } from "@typespec/compiler";
import type { ServerNode } from "#core/resolve/service.js";

/**
 * Stubs of the semantic model fields a test never reads.
 *
 * The lower stage reads `AsyncAPIService` and nothing else, so it runs
 * without compiling TypeSpec. Two fields of that model are compiler types,
 * and no compiler builds a type outside a program, so a test driving
 * lowering directly must stub them instead.
 *
 * Anything that reads these fields for real belongs in a test host suite.
 */

/**
 * A source location the lower stage never reads.
 *
 * Every node carries a target, and the lower half of the pipeline only
 * reports against one after schema expansion. A test that expands no schema
 * can share one stub across every node.
 */
export const stubTarget = { kind: "Namespace", name: "Stub" } as unknown as DiagnosticTarget;

/** Builds a distinct stub model, so identity comparisons stay meaningful. */
export function stubModel(name: string): Model {
  return { kind: "Model", name } as unknown as Model;
}

/** Builds a server node whose target is the shared stub. */
export function stubServerNode(fields: Omit<ServerNode, "target">): ServerNode {
  return { target: stubTarget, ...fields };
}
