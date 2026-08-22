import { describe, it, expect } from "vitest";
import { lowerServers } from "../../../src/lower/servers.js";
import type { ServerNode } from "../../../src/resolve/service.js";

/** The smallest server node lowerServers accepts, keyed by the name under test. */
function stubServer(name: string): ServerNode {
  return {
    target: { kind: "Namespace", name: "Stub" } as unknown as ServerNode["target"],
    name,
    host: "broker.example.com",
    protocol: "mqtt",
    security: [],
    tags: [],
    bindings: [],
  };
}

describe("Unit: lowering the servers of one document", () => {
  it("omits the section when there is no node", () => {
    // An empty `servers` claims the application has none rather than that
    // none were declared, so the field is omitted. "No node" is a single
    // point, so it is stated rather than drawn; the non-empty half is the
    // keying property in `test/property-based/lower-transforms.test.ts`.
    expect(lowerServers([])).toBeUndefined();
  });

  it("keeps the prototype of the built map untouched", () => {
    // See the bindings suite beside this one: two names are the whole input
    // space of the claim.
    const names = ["__proto__", "constructor", "orders"];

    const servers = lowerServers(names.map(stubServer)) as object;

    expect(Object.getPrototypeOf(servers)).toBe(Object.prototype);
    for (const name of names) expect(Object.hasOwn(servers, name)).toBe(true);
  });
});
