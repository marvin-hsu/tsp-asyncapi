import { describe, it, expect } from "vitest";
import { lowerServers } from "#emitter/lower/servers.js";
import type { ServerNode } from "#core/resolve/service.js";
import { noPromotions } from "../../../utils/promotions.js";
import { stubServerNode } from "../../../utils/ir-stubs.js";

/** The smallest server node lowerServers accepts, keyed by the name under test. */
function stubServer(name: string): ServerNode {
  return stubServerNode({
    name,
    host: "broker.example.com",
    protocol: "mqtt",
    security: [],
    tags: [],
    bindings: [],
  });
}

describe("Unit: lowering the servers of one document", () => {
  it("omits the section when there is no node", () => {
    // An empty `servers` claims the application has none, not that none
    // were declared. The field is omitted instead.
    expect(lowerServers([], noPromotions())).toBeUndefined();
  });

  it("keeps the prototype of the built map untouched", () => {
    // See the bindings suite beside this one: two names are the whole input
    // space of the claim.
    const names = ["__proto__", "constructor", "orders"];

    const servers = lowerServers(names.map(stubServer), noPromotions()) as object;

    expect(Object.getPrototypeOf(servers)).toBe(Object.prototype);
    for (const name of names) expect(Object.hasOwn(servers, name)).toBe(true);
  });
});
